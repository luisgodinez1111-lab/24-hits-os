// Función serverless de Vercel para la API NestJS.
// Importa el bundle YA COMPILADO por tsc (dist/serverless.js), que conserva la
// metadata de decoradores (emitDecoratorMetadata) — esbuild la eliminaría y rompería
// la inyección de dependencias de Nest. La app se inicializa una sola vez.
const { createServer } = require("../dist/serverless.js");

let ready;

module.exports = async (req, res) => {
  if (!ready) ready = createServer();
  const handler = await ready;
  handler(req, res);
};
