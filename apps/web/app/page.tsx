import { redirect } from "next/navigation";

/**
 * La raíz no enseña nada: **reparte**.
 *
 * Un sistema de punto de venta no tiene página de bienvenida. Quien abre esta
 * dirección es una de dos personas, y ninguna quiere leer:
 *
 *  · El operador de una estación fija, que necesita entrar y cobrar.
 *  · La dueña desde su teléfono, que quiere ver cómo va el día.
 *
 * Las dos empiezan por identificarse, así que `/` manda al acceso por PIN. Y
 * el acceso, una vez sabe quién entra y desde qué dispositivo, lleva a la
 * superficie que le corresponde a ese rol (§7.3): la cajera a caja, la
 * monitora a la sala, la administradora al panel.
 *
 * TODO(F2-12/backend): cuando exista sesión de dispositivo, esta redirección
 * comprobará primero si ya hay una abierta y saltará directamente a su
 * superficie, sin volver a pedir el PIN en cada visita.
 */
export default function Raiz() {
  redirect("/acceso");
}
