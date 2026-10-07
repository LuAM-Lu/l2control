/**
 * La Puesta a punto — JORNADA §2 (P6), T-4.
 *
 * Tras la instalación inicial el local existe pero está vacío. Inicio le enseña a administración
 * esta lista, que **se tacha sola cuando el dato existe**: nadie marca nada a mano, así que no
 * puede decir «hecho» lo que no lo está. Cada punto dice qué puesto no puede trabajar sin él;
 * los que no bloquean nada son recomendables.
 *
 * Solo lee, y solo cuenta: no enseña ningún dato del negocio ni ningún secreto. La ve quien
 * gestiona personas (administración); a los demás no les dice nada que puedan arreglar.
 */
import { PuestaAPuntoSchema, type PuestaAPuntoDto, type PuntoDePuestaAPuntoDto, type Resultado } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { permisoEn, rechazoDePermiso } from "../identidad/actor.ts";

export interface CasosPuestaAPunto {
  leer(ctx: Contexto): Promise<Resultado<PuestaAPuntoDto>>;
}

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function casosPuestaAPunto(base: Base): CasosPuestaAPunto {
  return {
    leer(ctx) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<PuestaAPuntoDto>> => {
        const permiso = await permisoEn(tx, ctx, "usuarios.gestionar");
        if (permiso !== "PERMITIDO") return rechazoDePermiso(permiso);
        const enSucursal = { branches: { some: { branchId: ctx.branchId } } };

        // De una en una: es la única conexión de la transacción.
        const personas = await tx.staffUser.count({ where: { active: true, pinHash: { not: null }, ...enSucursal } });
        const equipos = await tx.device.count({ where: { branchId: ctx.branchId, status: "APROBADO" } });
        const tarifas = await tx.parkTariffVersion.count({ where: { branchId: ctx.branchId } });
        const impuestos = await tx.taxRate.count();
        const tasas = await tx.exchangeRate.count({ where: { confirmation: { isNot: null } } });
        // Los que piden datos del LOCAL (su teléfono, su correo, su terminal). El USDT también lleva
        // `dataKind`, pero nace encendido sin que nadie cargue nada: contarlo daría el punto por hecho.
        const mediosConDatos = await tx.paymentMethod.count({ where: { active: true, dataKind: { in: ["PAGO_MOVIL", "ZELLE", "PUNTO"] } } });
        const productos = await tx.product.count({ where: { active: true } });
        const impresoras = await tx.printer.count({ where: { branchId: ctx.branchId, active: true, retiredAt: null } });
        const feriados = await tx.bankHoliday.count({ where: { retiredAt: null } });
        const plano = await tx.floorPlanVersion.count({ where: { branchId: ctx.branchId } });
        const enCarta = await tx.product.count({ where: { active: true, onMenu: true } });
        const conExistencia = await tx.product.count({ where: { active: true, tracksStock: true } });
        const movimientos = await tx.stockMovement.count({ where: { branchId: ctx.branchId } });
        const descuentos = await tx.discountRule.count({ where: { retiredAt: null } });
        const vip = await tx.guardianVip.count();
        // Con contraseña ya confirma identidad (en su equipo de confianza, con la app, la llave o un código).
        const administraciones = await tx.staffUser.count({ where: { active: true, role: "ADMIN", passwordHash: { not: null }, ...enSucursal } });
        // Fuera de su equipo de confianza hace falta la app o una llave (ADR-029).
        const desdeOtrosEquipos = await tx.staffUser.count({
          where: {
            active: true,
            role: "ADMIN",
            passwordHash: { not: null },
            OR: [{ passkeys: { some: { retiredAt: null } } }, { totpCredentials: { some: { confirmedAt: { not: null }, retiredAt: null } } }],
            ...enSucursal,
          },
        });

        const puntos: PuntoDePuestaAPuntoDto[] = [
          {
            id: "personas",
            hecho: personas >= 2,
            bloquea: "Que otra persona opere",
            detalle: personas >= 2 ? `${cuantos(personas, "persona", "personas")} con su PIN` : "Solo estás tú: da de alta al equipo, con su rol y su PIN",
          },
          {
            id: "equipos",
            hecho: equipos >= 2,
            bloquea: "El puesto que no tenga equipo",
            detalle: equipos >= 2 ? `${cuantos(equipos, "equipo aprobado", "equipos aprobados")}` : "Solo este equipo está aprobado: registra el de cada puesto desde él mismo",
          },
          {
            id: "tarifas",
            hecho: tarifas > 0,
            bloquea: "La entrada al parque",
            detalle: tarifas > 0 ? "Tarifas del parque publicadas" : "Falta publicar las tarifas y paquetes del parque",
          },
          {
            id: "impuestos",
            hecho: impuestos > 0,
            bloquea: "Cobrar",
            detalle: impuestos > 0 ? "Impuestos programados" : "Una base nueva no los trae: prográmalos con lo que confirme el contador",
          },
          {
            id: "tasa",
            hecho: tasas > 0,
            bloquea: "Cobrar en bolívares",
            detalle: tasas > 0 ? "Hay tasa del BCV confirmada" : "La primera tasa no se aplica sola: confírmala",
          },
          {
            id: "medios",
            hecho: mediosConDatos > 0,
            bloquea: null,
            detalle:
              mediosConDatos > 0
                ? `${cuantos(mediosConDatos, "medio con datos del local encendido", "medios con datos del local encendidos")}`
                : "El efectivo y el USDT ya están; Pago Móvil, Zelle y el punto piden los datos del local",
          },
          {
            id: "catalogo",
            hecho: productos > 0,
            bloquea: "La venta directa en caja",
            detalle: productos > 0 ? `${cuantos(productos, "producto", "productos")} en el catálogo` : "Falta cargar lo que se vende en el mostrador",
          },
          {
            id: "impresoras",
            hecho: impresoras > 0,
            bloquea: "Las comandas y el ticket de corte",
            detalle: impresoras > 0 ? `${cuantos(impresoras, "impresora", "impresoras")}` : "Falta dar de alta la impresora y vincular su agente",
          },
          {
            id: "feriados",
            hecho: feriados > 0,
            bloquea: null,
            detalle: feriados > 0 ? `${cuantos(feriados, "feriado bancario cargado", "feriados bancarios cargados")}` : "Sin ellos, ese día la tasa se pide a mano",
          },
          {
            id: "carta_y_plano",
            hecho: plano > 0 && enCarta > 0,
            bloquea: "Las mesas y las comandas",
            detalle: plano > 0 && enCarta > 0 ? "Plano publicado y carta con productos" : plano > 0 ? "Falta poner productos en la carta" : "Falta publicar el plano del local",
          },
          {
            id: "existencias",
            // Sin nada que lleve existencia no hay nada que cargar.
            hecho: conExistencia === 0 ? productos > 0 : movimientos > 0,
            bloquea: "Vender lo que lleva existencia",
            detalle:
              conExistencia === 0
                ? productos > 0
                  ? "Ningún producto lleva existencia"
                  : "Se cargan después del catálogo"
                : movimientos > 0
                  ? "Hay entradas de mercancía cargadas"
                  : "Sin existencia no se vende: carga la primera entrada de mercancía",
          },
          {
            id: "descuentos",
            hecho: descuentos > 0 || vip > 0,
            bloquea: null,
            detalle: descuentos > 0 || vip > 0 ? "Hay descuentos o familias VIP" : "Opcional: descuentos por medio de pago, manuales y familias VIP",
          },
          {
            id: "segunda_administracion",
            hecho: administraciones >= 2,
            bloquea: null,
            detalle:
              administraciones >= 2
                ? `${administraciones} personas de administración con sus credenciales`
                : "Regla de operación: siempre dos. Da de alta a otra y envíale su enlace",
          },
          {
            id: "otros_equipos",
            hecho: desdeOtrosEquipos >= 1,
            bloquea: null,
            detalle:
              desdeOtrosEquipos >= 1
                ? "Administración puede confirmar también fuera de su equipo"
                : "Configura la app de autenticación en Ajustes → Usuarios para confirmar desde otros equipos",
          },
        ];
        return {
          ok: true,
          valor: PuestaAPuntoSchema.parse({ puntos, pendientesQueBloquean: puntos.filter((p) => !p.hecho && p.bloquea !== null).length }),
        };
      });
    },
  };
}
