# health-pricing-lovable-ui

Build it in one pass, please.

Agreed on all three points:
1. Quote form: drive the layout by factor group (age, condition, region).
2. Mock impact: a deterministic function of all scenario parameters. Keep it inside src/api/mock/ only. Components must only display the impact returned by the client and never calculate it.
3. Role rules: enforce them in the mocks, with 403 and 409 errors shown as toasts.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eb5241f8-3aef-4df1-a13c-175bbdcc3980).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
