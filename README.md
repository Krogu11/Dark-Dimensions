# Dark Dimensions

An English-first, localization-ready dark fantasy card RPG prototype.

## Development

```bash
npm install
npm run dev
```

Move on the world map with WASD or the arrow keys. Each run uses one Ironman
autosave. Entering locations and starting or surviving battles saves progress;
death permanently ends the run.

## Validation

```bash
npm test
npm run build
```

The original `cards.js` is retained as migration input and is not loaded by
the new application.
