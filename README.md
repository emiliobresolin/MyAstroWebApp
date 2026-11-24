# Órbita

Aplicação de mapa natal e técnicas de previsão. O navegador faz os cálculos astronômicos. O Cloudflare Worker protege as páginas e os arquivos do aplicativo com uma sessão assinada.

## Publicação

O projeto é compatível com Cloudflare Workers Free. Use uma conta com Workers habilitado, execute `npm ci` e publique com `npm run deploy`. O Worker usa duas configurações secretas, `AUTH_USERS` (JSON com dois verificadores) e `AUTH_KEY` (chave privada). O script `node server/provision.mjs` lê da entrada padrão um JSON com dois objetos com campos `username` e `password` e prepara os arquivos ignorados pelo Git em `.private/`. Para a primeira publicação, informe `--secrets-file .private/deploy-secrets.json` ao Wrangler. Mantenha esses arquivos fora de `dist/`.

## Testes

Execute `npm test` para validar a autenticação e os cálculos.
