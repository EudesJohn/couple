// Pour l'import CSS avec NativeWind
declare module '*.css' {}

// Pour les timeouts dans les hooks
declare namespace NodeJS {
  type Timeout = ReturnType<typeof setTimeout>;
}
