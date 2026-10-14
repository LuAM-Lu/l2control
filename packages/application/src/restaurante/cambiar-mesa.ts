/**
 * Cambiar de mesa — B6-21 (M-39, X-16).
 *
 * En el local pasó: una familia se sentó, pidió, y más tarde se cambió a otra mesa; el pedido quedó en la de antes. Aquí
 * la cuenta entera pasa a otra mesa del salón, con sus pedidos, sus niños vinculados y su historia: un mando propio (la
 * mesa de una cuenta no cambia con un «guardar»). Lo que falta servir saca un papel «CAMBIO DE MESA · 3 → 7» en la
 * cocina y en la barra, para que lo lleven a la nueva; las comandas que salgan después ya dicen la mesa nueva. La mesa
 * vieja queda por limpiar. Si la nueva tiene gente, queda como mesa compartida (B6-7), con sus reglas.
 *
 * Lo hace quien toma pedidos (la tablet y la caja), sin PIN: no mueve dinero. Queda en la auditoría.
 */
import {
  CambiarDeMesaCommandSchema,
  CambioDeMesaSchema,
  FamilyAccountSchema,
  problemasDe,
  type AreaDeComandaDto,
  type CambioDeMesaDto,
  type FamilyAccountDto,
  type PedidoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeCambioDeMesa } from "../impresion/plantillas.ts";
import { NOMBRE_DE_AREA, areaSinImpresora, oficioDe, sinImpresoraPara } from "./comandas.ts";
import { candadoDeMesas, cuentasDeLasMesas, mesaParaCuentaNueva } from "./plano.ts";
import { pedidosDe } from "./pedidos.ts";

type Plato = Readonly<{ nombre: string; cantidad: number; nota: string | null }>;

/**
 * Lo que falta servir de una cuenta, por área: de cada pedido, sus platos sin servir y sin anular. Lo que se sirve sin
 * papel no va; un pedido de antes de B6-10 (sin área) va a la cocina.
 */
export function porServir(pedidos: readonly PedidoDto[], cuenta: Pick<FamilyAccountDto, "lines">): Map<AreaDeComandaDto, Plato[]> {
  const papeles = new Map<AreaDeComandaDto, Plato[]>();
  for (const p of pedidos) {
    if (p.servido) continue;
    // Las unidades anuladas de cada producto de este pedido: no se llevan.
    const anuladas = new Map<string, number>();
    for (const l of cuenta.lines) {
      if (l.orderId === p.id && l.anulacion && l.productId) anuladas.set(l.productId, (anuladas.get(l.productId) ?? 0) + 1);
    }
    for (const l of p.lineas) {
      if (l.servido) continue;
      const area = l.area ?? "COCINA";
      if (area === "SIN_PAPEL") continue;
      const fuera = Math.min(l.cantidad, anuladas.get(l.productId) ?? 0);
      anuladas.set(l.productId, (anuladas.get(l.productId) ?? 0) - fuera);
      const cantidad = l.cantidad - fuera;
      if (cantidad > 0) papeles.set(area, [...(papeles.get(area) ?? []), { nombre: l.nombre, cantidad, nota: l.nota }]);
    }
  }
  return papeles;
}

const mesaPorDefecto = (c: Pick<FamilyAccountDto, "family" | "tableLabel">) => c.family === `Mesa ${c.tableLabel ?? ""}`;

export async function cambiarDeMesa(base: Base, ctx: Contexto, entrada: unknown, ahora: number): Promise<Resultado<CambioDeMesaDto>> {
  const v = CambiarDeMesaCommandSchema.safeParse(entrada);
  if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se cambió de mesa: hay datos que corregir.", problemas: problemasDe(v.error) };
  const cmd = v.data;

  const intentar = () =>
    base.conTenant(ctx.tenantId, async (tx): Promise<CambioDeMesaDto | Rechazo> => {
      const rechazo = await exigirPermiso(tx, ctx, "pedido.tomar");
      if (rechazo) return rechazo;

      // El reintento (se cortó la red) devuelve lo que quedó.
      const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
      if (previa) {
        if (previa.cause !== "CAMBIAR_MESA" || previa.accountId !== cmd.accountId) return conflictoDeClave;
        const antes = await tx.accountVersion.findFirst({ where: { accountId: previa.accountId, version: previa.version - 1 } });
        const ahoraEs = (await vigenteDe(tx, previa.accountId))!.cuenta;
        const desde = (antes?.content as { tableLabel?: string } | null)?.tableLabel ?? "?";
        return CambioDeMesaSchema.parse({ cuenta: ahoraEs, desde, a: ahoraEs.tableLabel ?? "?", papeles: [] });
      }

      await candadoDeMesas(tx, ctx.branchId);
      const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
      const vigente = fila?.branchId === ctx.branchId ? await vigenteDe(tx, cmd.accountId) : null;
      if (!vigente) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
      const cuenta = vigente.cuenta;
      if (cuenta.kind !== "MESA" || !cuenta.tableId) {
        return { ok: false, motivo: "INVALIDO", mensaje: "Solo una cuenta de mesa se cambia de mesa.", problemas: [{ path: ["accountId"], message: "NO_ES_DE_MESA" }] };
      }
      if (cuenta.status !== "ABIERTA" && cuenta.status !== "POR_COBRAR") {
        return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta ya no está abierta: vuelve a mirar el salón.", problemas: [{ path: ["accountId"], message: "CUENTA_CERRADA" }] };
      }
      if (vigente.version !== cmd.version) {
        return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta cambió mientras la mirabas: vuelve a intentarlo.", problemas: [{ path: ["version"], message: "VERSION" }] };
      }
      if (cuenta.tableId === cmd.tableId) {
        return { ok: false, motivo: "INVALIDO", mensaje: `Ya está en la mesa ${cuenta.tableLabel ?? ""}.`, problemas: [{ path: ["tableId"], message: "MISMA_MESA" }] };
      }

      // La mesa nueva: en el salón y, si tiene gente, como una cuenta más de una mesa compartida (B6-7: con un nombre que la
      // distinga, el de su cliente si no tenía uno propio, y sin pasar del máximo). Sola, el nombre por defecto («Mesa 3»)
      // pasa a ser el de la nueva.
      const otras = (await cuentasDeLasMesas(tx, ctx.branchId)).get(cmd.tableId) ?? [];
      const nombrePropio = mesaPorDefecto(cuenta) ? cuenta.cliente?.nombre : cuenta.family;
      const libre = await mesaParaCuentaNueva(
        tx,
        ctx.branchId,
        cmd.tableId,
        otras.length > 0 ? { ...(nombrePropio ? { nombre: nombrePropio } : {}), vistas: otras.length } : undefined,
      );
      if ("ok" in libre) return { ...libre, ...(libre.problemas ? { problemas: libre.problemas.map((p) => ({ ...p, path: ["tableId"] })) } : {}) };
      const desde = cuenta.tableLabel ?? "?";
      const a = libre.label;

      // El papel de cada área con lo que falta servir: sin su impresora, la cocina no se enteraría (fail-closed).
      const pedidos = await pedidosDe(tx, await tx.kitchenOrder.findMany({ where: { accountId: cuenta.id }, orderBy: { number: "asc" } }));
      const papeles = porServir(pedidos, cuenta);
      const falta = await areaSinImpresora(tx, ctx.branchId, [...papeles.keys()]);
      if (falta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: sinImpresoraPara(falta, `${falta === "BARRA" ? "la barra" : "la cocina"} no sabría a qué mesa llevarlo`) };

      const quien = await nombreDe(tx, ctx);
      const nueva = FamilyAccountSchema.parse({
        ...cuenta,
        tableId: cmd.tableId,
        tableLabel: a,
        ...(mesaPorDefecto(cuenta) ? { family: otras.length > 0 && nombrePropio ? nombrePropio : `Mesa ${a}` } : {}),
        version: vigente.version + 1,
      });
      await guardarVersion(tx, ctx, nueva, { cause: "CAMBIAR_MESA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });

      const local = await ajustesDe(tx, ctx.branchId);
      const nombreCuenta = mesaPorDefecto(nueva) ? null : nueva.family;
      for (const [area, lineas] of papeles) {
        const trabajo = await encolarEn(
          tx,
          ctx,
          {
            tipo: "CAMBIO_MESA",
            para: oficioDe(area),
            area,
            titulo: `Cambio de mesa · ${desde} → ${a} · ${NOMBRE_DE_AREA[area]}`,
            documento: documentoDeCambioDeMesa({ area, desde, a, nombreCuenta, en: ahora, por: quien.nombre, lineas }, local),
          },
          ahora,
        );
        if ("ok" in trabajo) throw new Error(`El cambio de mesa no encoló su papel: ${trabajo.mensaje}`);
      }

      await auditar(tx, ctx, {
        action: "mesa.cambiar",
        entityType: "account",
        entityId: nueva.id,
        before: { mesa: desde, version: vigente.version },
        after: { mesa: a, version: nueva.version ?? null, compartida: otras.length > 0, papeles: [...papeles.keys()] },
      });
      return CambioDeMesaSchema.parse({ cuenta: nueva, desde, a, papeles: [...papeles.keys()] });
    });

  try {
    const r = await intentar();
    if ("ok" in r) {
      if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "mesa.cambiar", reason: r.mensaje });
      return r;
    }
    return { ok: true, valor: r };
  } catch (e) {
    // Dos toques a la vez (la misma versión): se vuelve a mirar.
    if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
    const r = await intentar();
    return "ok" in r ? r : { ok: true, valor: r };
  }
}

