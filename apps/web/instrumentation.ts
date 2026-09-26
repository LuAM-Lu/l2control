/**
 * Next llama a `register` una vez, antes de atender peticiones. Aquí se valida el entorno y
 * se abre la base: si falla, el servidor no arranca (B0-3, B0-5).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { arrancar } = await import("./src/servidor/arranque");
  await arrancar();
}
