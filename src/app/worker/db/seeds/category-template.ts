/**
 * Plantilla opcional de categorías del primer arranque (T3.4), sacada de la hoja de gastos
 * mensual del usuario. Los nombres son datos semilla: una vez cargados, el usuario los edita.
 */

type Kind = 'ingreso' | 'gasto' | 'ahorro';

interface TemplateGroup {
  readonly name: string;
  /** Tipo de sus subcategorías; el grupo en sí no tiene tipo. */
  readonly kind: Kind;
  readonly color: string;
  /** Subcategorías: nombre y color propio opcional (si no, hereda el del grupo en la UI). */
  readonly children: readonly (readonly [name: string, color?: string])[];
}

export interface SeedStatement {
  readonly sql: string;
  readonly bind: readonly (string | number | null)[];
}

export const CATEGORY_TEMPLATE: readonly TemplateGroup[] = [
  {
    name: 'Ingresos',
    kind: 'ingreso',
    color: '#2E8B57',
    children: [['Nómina'], ['Ingresos extra']],
  },
  {
    name: 'Ahorro',
    kind: 'ahorro',
    color: '#8C8CE0',
    children: [['Aportación a ahorro'], ['Retirada de ahorro']],
  },
  {
    name: 'Hipoteca y vivienda',
    kind: 'gasto',
    color: '#E9675A',
    children: [['Cuota hipoteca'], ['Seguros de la vivienda'], ['Impuestos']],
  },
  {
    name: 'Préstamos y financiaciones',
    kind: 'gasto',
    color: '#D81BD8',
    children: [
      ['Financiaciones'],
      ['Plataformas y suscripciones'],
      ['Donaciones y colaboraciones'],
      ['Otros'],
    ],
  },
  {
    name: 'Suministros',
    kind: 'gasto',
    color: '#26B5B5',
    children: [['Comunidad de vecinos'], ['Luz']],
  },
  {
    name: 'Transporte',
    kind: 'gasto',
    color: '#F59E0B',
    children: [['Transporte público'], ['Financiación coche'], ['Coche'], ['Moto'], ['Gasolina']],
  },
  {
    name: 'Variables',
    kind: 'gasto',
    color: '#9C3A00',
    children: [
      ['Cuidado personal'],
      ['Comida'],
      ['Restaurantes'],
      ['Hogar'],
      ['Ocio'],
      ['Manualidades'],
      ['Estudios'],
      ['Ropa'],
      ['Escapadas y viajes'],
      ['Regalos'],
    ],
  },
];

const INSERT_GROUP =
  'INSERT INTO categories (parent_id, name, color, sort_order) VALUES (NULL, ?, ?, ?)';

const INSERT_CHILD = `INSERT INTO categories (parent_id, name, kind, color, sort_order)
  SELECT id, ?, ?, ?, ? FROM categories WHERE parent_id IS NULL AND name = ?`;

/** Sentencias parametrizadas para cargar la plantilla; se ejecutan en una transacción. */
export function categoryTemplateStatements(
  template: readonly TemplateGroup[] = CATEGORY_TEMPLATE,
): SeedStatement[] {
  return template.flatMap((group, groupIndex) => [
    { sql: INSERT_GROUP, bind: [group.name, group.color, groupIndex + 1] },
    ...group.children.map(([name, color], childIndex) => ({
      sql: INSERT_CHILD,
      bind: [name, group.kind, color ?? null, childIndex + 1, group.name],
    })),
  ]);
}
