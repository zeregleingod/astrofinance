# core

Lo que la aplicación Angular necesita una sola vez y comparten todas las pantallas:

- `layout/`: el armazón (barra lateral, aviso de demo).
- `navigation/`: menú derivado de las rutas y título de la pestaña.
- `theme/`, `i18n/`: tema claro/oscuro y textos visibles.
- `demo/`: guard de la ruta `/demo`.
- `period/`: helpers `inject*()` que usan varias _features_ y necesitan `data` o el router
  (p. ej. el mes seleccionado). Viven aquí porque `shared` no puede importar `data`.

Reglas:

- Puede importar `domain` y `data`.
- No importa `features`, `shared` ni `workers`.
- Un componente de UI genérico sin estado de negocio va en `shared`, no aquí.
