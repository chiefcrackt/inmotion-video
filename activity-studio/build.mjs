import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await build({entryPoints:['activity-studio/worker-source.mjs'],outfile:'activity-studio/worker.js',bundle:true,platform:'browser',format:'iife',minify:true,legalComments:'eof'});
await mkdir('activity-studio/licenses',{recursive:true});
await copyFile('node_modules/@garmin/fitsdk/LICENSE.txt','activity-studio/licenses/garmin-fit.txt');
await copyFile('node_modules/@xmldom/xmldom/LICENSE','activity-studio/licenses/xmldom.txt');
console.log('Activity worker and licenses built. GitHub Pages can serve the committed files directly.');
