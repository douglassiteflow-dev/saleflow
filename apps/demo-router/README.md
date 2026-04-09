# demo-router

Next.js app som proxyar `demo.siteflow.se/:slug` till den riktiga Vercel-deployment URL:en för varje genererad hemsida.

## Hur det fungerar

1. Användare besöker `demo.siteflow.se/sakura-relax-massage-59498`
2. `middleware.ts` extraherar slug (`sakura-relax-massage-59498`)
3. Slår upp slug → URL via `GET https://sale.siteflow.se/api/d/:slug`
4. `NextResponse.rewrite()` till den riktiga Vercel-URL:en
5. URL i webbläsaren stannar på `demo.siteflow.se/:slug` (proxy, ej redirect)
6. Cache: 5 min på edge (`revalidate: 300`)

## Varför behövs det?

Varje demo deployas som ETT eget Vercel-projekt med en unik URL som innehåller en hash:
`sakura-relax-massage-59498-loht9uoup-siteflow-dev.vercel.app`

Vi vill ge kunderna en enkel och professionell URL: `demo.siteflow.se/kundnamn`.

Router-appen gör denna översättning transparent via Next.js Edge Middleware.

## Utveckling

```bash
npm install
npm run dev
# → http://localhost:3000
```

Besök `http://localhost:3000/sakura-relax-massage-59498` för att testa.

## Deploy till Vercel

```bash
vercel deploy --prod
```

Sedan:

1. Vercel dashboard → projekt `demo-router`
2. Settings → Domains → Add `demo.siteflow.se`
3. I Strato (DNS): `CNAME demo → cname.vercel-dns.com`

## Miljövariabler

- `SALEFLOW_API_URL` — default `https://sale.siteflow.se`

## Full dokumentation

Se `docs/architecture/demo-generation-pipeline.md` i repo-root för hela pipelinen (från outcome → Vercel-deploy).
