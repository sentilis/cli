/**
 * Reexport de compatibilidad.
 *
 * Hasta la 4.x este paquete publicaba el SDK además del binario. El SDK se
 * mudó al monorepo de la plataforma y se publica como `@sentilis/sdk`; estos
 * ficheros mantienen vivos los subpaths antiguos durante toda la 5.x para que
 * nadie se quede sin compilar de un día para otro.
 *
 * Importa `@sentilis/sdk` directamente. Estos reexports se retiran en la 6.0.
 *
 * @deprecated Usa `@sentilis/sdk`.
 */
export * from "@sentilis/sdk";
