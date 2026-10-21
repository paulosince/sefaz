# vendor

`neon-js-0.8.0-beta.mjs` — SDK oficial [@neondatabase/neon-js](https://www.npmjs.com/package/@neondatabase/neon-js)
0.8.0-beta (licença Apache-2.0), empacotado para o navegador com esbuild:

```sh
echo "export { createClient } from '@neondatabase/neon-js';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --outfile=neon-js-0.8.0-beta.mjs
```

Só é carregado quando `js/config.js` tem as URLs do Neon Auth e da Data API.
