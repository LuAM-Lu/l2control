/**
 * Las categorías del catálogo como lista propia — T-10, M-24.
 *
 * El local tiene su lista (`product_category`), que nace con las de arranque (`crearLocal`). El
 * producto guarda el nombre de la suya: renombrar o unir cambia ese nombre en sus productos, en la
 * misma transacción, y queda en la auditoría con cuántos movió. Quién decide qué:
 *  · el dominio: qué nombre vale (`categoryProblem`) y cuándo dos son la misma (`findCategory`, sin
 *    contar mayúsculas, acentos ni espacios);
 *  · la matriz: es del catálogo (`catalogo.modificar`, con elevación), como un producto;
 *  · este archivo: la transacción y su asiento.
 *
 * Nada se borra: una categoría se retira (vacía) o se une a otra.
 */
import { CategoriaCommandSchema, problemasDe, type CatalogoDto, type CategoriaCommand, type Rechazo, type Resultado } from "@l2/contracts";
import { categoryProblem, cleanCategory, findCategory, nameKey } from "@l2/domain-inventory";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo, type AccionAuditada } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { cargarCatalogo } from "./productos.ts";

export interface CasosCategorias {
  /** Un cambio de la lista (`CategoriaCommandSchema`). Devuelve el catálogo como queda. */
  aplicar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CatalogoDto>>;
}

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

const MENSAJE_NOMBRE = { CORTA: "Escribe la categoría", LARGA: "Hasta 24 caracteres: es una pestaña de la caja" } as const;




/** Los productos (activos o apartados) que llevan la categoría `nombre`. */
async function productosDeCategoria(tx: Transaccion, nombre: string) {
  const clave = nameKey(nombre);
  return (await tx.product.findMany({ select: { id: true, category: true } })).filter((p) => nameKey(p.category) === clave);
}

function accionDe(cmd: CategoriaCommand): AccionAuditada {
  switch (cmd.kind) {
    case "CREAR":
      return "categoria.crear";
    case "RENOMBRAR":
      return "categoria.renombrar";
    case "UNIR":
      return "categoria.unir";
    case "RETIRAR":
      return "categoria.retirar";
  }
}

export function casosCategorias(base: Base): CasosCategorias {
  return {
    async aplicar(ctx, entrada, ahora = Date.now()) {
      const v = CategoriaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La categoría no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      if (cmd.kind === "CREAR" || cmd.kind === "RENOMBRAR") {
        const problema = categoryProblem(cmd.nombre);
        if (problema) return invalido("La categoría no se guardó: hay datos que corregir.", ["nombre"], MENSAJE_NOMBRE[problema]);
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CatalogoDto | Rechazo> => {
          // La lista de categorías es del inventario (T-13), no de los precios: se puede dar por rol o por persona.
          const rechazo = await exigirPermiso(tx, ctx, "inventario.catalogo");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          const hecho = await guardar(tx, ctx, cmd, quien.nombre, ahora);
          if (hecho) return hecho;
          return cargarCatalogo(tx, ctx.branchId);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accionDe(cmd), reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos personas crean a la vez la misma: la base deja una.
        if (errorDeBase(e)?.motivo === "DUPLICADO") return invalido("Ya hay una categoría con ese nombre.", ["nombre"], "Ya existe");
        throw e;
      }
    },
  };
}

/** Escribe el cambio con su asiento. `null` si se hizo; si no, el rechazo. */
async function guardar(tx: Transaccion, ctx: Contexto, cmd: CategoriaCommand, quien: string, ahora: number): Promise<Rechazo | null> {
  const vigentes = await tx.productCategory.findMany({ where: { retiredAt: null } });
  const deId = (id: string) => vigentes.find((c) => c.id === id);
  switch (cmd.kind) {
    case "CREAR": {
      const nombre = cleanCategory(cmd.nombre);
      const ya = findCategory(vigentes, nombre);
      if (ya) return invalido(`Ya existe «${ya.name}».`, ["nombre"], `Ya existe «${ya.name}»`);
      const fila = await tx.productCategory.create({ data: { tenantId: ctx.tenantId, name: nombre, createdAt: new Date(ahora), createdByName: quien } });
      await auditar(tx, ctx, { action: "categoria.crear", entityType: "product_category", entityId: fila.id, after: { nombre: fila.name } });
      return null;
    }
    case "RENOMBRAR": {
      const antes = deId(cmd.id);
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa categoría ya no está en la lista." };
      const nombre = cleanCategory(cmd.nombre);
      if (nombre === antes.name) return invalido("No cambia nada.", ["nombre"], "Ya se llama así");
      // Otra con ese nombre: se unen, no se renombra encima. Cambiar solo mayúsculas o acentos de la misma, sí.
      const otra = findCategory(vigentes.filter((c) => c.id !== antes.id), nombre);
      if (otra) return invalido(`Ya existe «${otra.name}»: únelas en vez de renombrar.`, ["nombre"], `Ya existe «${otra.name}»`);
      const suyos = await productosDeCategoria(tx, antes.name);
      await tx.productCategory.update({ where: { id: antes.id }, data: { name: nombre } });
      if (suyos.length > 0) await tx.product.updateMany({ where: { id: { in: suyos.map((p) => p.id) } }, data: { category: nombre } });
      await auditar(tx, ctx, {
        action: "categoria.renombrar",
        entityType: "product_category",
        entityId: antes.id,
        before: { nombre: antes.name },
        after: { nombre, productos: suyos.length },
      });
      return null;
    }
    case "UNIR": {
      const origen = deId(cmd.id);
      const destino = deId(cmd.en);
      if (!origen || !destino) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Una de las dos categorías ya no está en la lista." };
      const suyos = await productosDeCategoria(tx, origen.name);
      if (suyos.length > 0) await tx.product.updateMany({ where: { id: { in: suyos.map((p) => p.id) } }, data: { category: destino.name } });
      await tx.productCategory.update({ where: { id: origen.id }, data: { retiredAt: new Date(ahora), retiredByName: quien } });
      await auditar(tx, ctx, {
        action: "categoria.unir",
        entityType: "product_category",
        entityId: origen.id,
        before: { nombre: origen.name },
        after: { en: destino.name, productos: suyos.length },
      });
      return null;
    }
    case "RETIRAR": {
      const antes = deId(cmd.id);
      if (!antes) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa categoría ya no está en la lista." };
      const suyos = await productosDeCategoria(tx, antes.name);
      if (suyos.length > 0) {
        return invalido(
          `«${antes.name}» tiene ${suyos.length} ${suyos.length === 1 ? "producto" : "productos"}: únela a otra en vez de retirarla.`,
          ["id"],
          "Tiene productos",
        );
      }
      await tx.productCategory.update({ where: { id: antes.id }, data: { retiredAt: new Date(ahora), retiredByName: quien } });
      await auditar(tx, ctx, { action: "categoria.retirar", entityType: "product_category", entityId: antes.id, before: { nombre: antes.name } });
      return null;
    }
  }
}
