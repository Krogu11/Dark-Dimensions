# Card assets

The development Content Studio writes assets to one folder per card:

```text
public/assets/cards/<card-id>/portrait.webp
public/assets/cards/<card-id>/card.webp
```

Portraits use a 3:4 crop at 768 x 1024 pixels. Missing assets fall back to the
initial-based placeholder used by the battle UI.
