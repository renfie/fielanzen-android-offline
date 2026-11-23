// Standalone browser preview type stubs; NOT included in the Android/Vite build.
declare module '@capacitor-community/sqlite' {
  export const CapacitorSQLite: any;
  export class SQLiteConnection {
    constructor(plugin: any);
    createConnection(...args:any[]): Promise<any>;
  }
}

declare module '@capacitor/filesystem' {
  export const Filesystem:any;export const Directory:any;export const Encoding:any;
}
declare module '@capacitor/share' {export const Share:any;}
declare module '@capacitor/app' {export const App:any;}

declare module '@capacitor/core' { export function registerPlugin<T>(name:string):T; export const CapacitorHttp:{request(options:any):Promise<{status:number;data:unknown}>;get(options:any):Promise<{status:number;data:unknown}>}; }
