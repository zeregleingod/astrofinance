# ADR-0018: Categorías propuestas al importar, por las reglas y por el historial

- **Estado:** aceptado
- **Fecha:** 2026-10-22

## Contexto

La revisión de una importación (T6.4) dejaba todos los movimientos sin categoría, aunque las
reglas (ADR-0011) o los movimientos ya clasificados dijeran cuál les toca. Se valoró un modelo
de _embeddings_ (`paraphrase-multilingual-MiniLM-L12-v2` con transformers.js), pero pesa unos
120 MB, supera el límite de 100 MB por fichero de GitHub y entiende mal conceptos bancarios como
`COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA`, que no son frases. Lo que de verdad distingue
un movimiento es el nombre del comercio, y eso se aprende del propio historial del usuario.

## Decisión

- **Propuesta en dos pasos** (`domain/suggestions/category-suggestion.ts`): primero las reglas,
  en su orden; si ninguna coincide, el historial. Las reglas limitadas a una cuenta no se aplican
  en la primera importación de una cuenta, que aún no existe.
- **Clasificador del historial** (`domain/suggestions/history-classifier.ts`), TypeScript puro y
  sin dependencias:
  - Del concepto del banco se quitan números, fechas, tarjetas enmascaradas, palabras de menos de
    tres letras y las que el banco pone en todo (`COMPRA`, `TARJ`, `ADEUDO`, `RECIBO`,
    `TRANSFERENCIA`…). Con poco historial el IDF no basta para saber que son genéricas.
  - Cada concepto pasa a un vector TF-IDF de palabras y trigramas de letras (estos pesan 0,3).
    Los rasgos que no están en el historial (otra ciudad, otra sucursal) cuentan a medias.
  - Votan los 5 vecinos más parecidos con el mismo signo (un gasto no aprende de ingresos), con un
    coseno de 0,5 como mínimo. La categoría ganadora necesita el 60 % de los votos; si no, no se
    propone nada.
  - Se aprende de los 5000 movimientos clasificados más recientes, por el concepto del banco
    (ADR-0007), y solo se proponen subcategorías asignables (no archivadas).
- **En el worker de BD** (`suggestCategories`), que ya tiene los datos: el historial no sale del
  worker y el entrenamiento se hace en cada petición, sin estado que invalidar.
- **En la revisión**: la propuesta viene puesta en el selector, con la marca «Propuesta por una
  regla» o «Sugerida por movimientos parecidos» (enlazada con `aria-describedby`) y un recuento
  sobre la tabla. Si el usuario cambia la categoría, pasa a ser suya. Si la petición falla, la
  revisión sigue sin propuestas.
- **Origen guardado.** Nuevo valor `category_source = 'sugerencia'` (migración 006, que reconstruye
  `transactions` porque SQLite no deja cambiar un `CHECK`). Lo propuesto por una regla se guarda
  como `regla` con su `rule_id` (o sin él, si la regla se borró durante la revisión). Lo elegido a
  mano es `manual`. Como `regla`, `sugerencia` no es manual: «Aplicar a movimientos existentes»
  puede cambiarlo.

## Consecuencias

- Sin modelos, sin red y sin coste de carga: entrenar con 5000 movimientos y proponer para un
  extracto tarda milisegundos.
- No entiende el significado. Un comercio que no aparece nunca en el historial no recibe
  propuesta. Con un historial muy corto acierta poco, y solo se fija en palabras y letras.
- Los umbrales salen de ejemplos ficticios. Habrá que ajustarlos con extractos reales.
- Aceptar una sugerencia sin mirarla la guarda como `sugerencia`, no como `manual`: una regla
  creada después puede corregirla, pero nunca pisará lo elegido a mano.
- Pendiente: proponer también al dar de alta o editar un movimiento, una opción para
  desactivarlo y la fase 2 (búsqueda semántica con un modelo local, opcional, en su propio ADR).
