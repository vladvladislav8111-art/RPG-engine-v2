/** Read-only source; writes a new local file, refusing overwrite.
 * DENO_KV_ACCESS_TOKEN must be set by the operator outside the command line.
 * Usage: deno run --unstable-kv --allow-env --allow-net --allow-write scripts/chroma_backup_export.ts KV_URL OUTPUT.json
 */
import {exportLabProjectBackup} from "../src/rpg_lab_v1/project_backup.ts";
const [url,output]=Deno.args;
if(!url||!output)throw Error("EXPECTED_KV_URL_AND_OUTPUT");
const kv=await Deno.openKv(url);
try{
 const backup=await exportLabProjectBackup(kv,"chroma_orario_main_20261120","chroma_day0_20261120");
 await Deno.writeTextFile(output,JSON.stringify(backup),{createNew:true,mode:0o600});
 console.log(JSON.stringify({sha256:backup.sha256,revision:backup.revision,entries:backup.entries.length,sourceReadOnly:true}));
}finally{kv.close();}
