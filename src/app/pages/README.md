# pages

Una carpeta por pantalla, cargada de forma _lazy_ desde `app.routes.ts`, más `shell/`: el armazón
común (barra lateral, aviso de demo, menú, título de la pestaña).

- Importa `ui`, `services` y `domain`. Nunca `worker` ni otra página.
- Dentro de una carpeta se importa con rutas relativas (`./x`). Las pantallas hermanas que
  comparten piezas van juntas (`rules/`); lo que compartan pantallas distintas va a `ui/` o
  `services/`.
