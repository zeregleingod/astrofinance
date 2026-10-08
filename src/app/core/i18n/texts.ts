/**
 * Textos de la interfaz centralizados (es-ES). Ningún componente debe
 * contener literales visibles para el usuario fuera de este fichero.
 */
export const TEXTS = {
  app: {
    name: 'AstroFinance',
  },
  nav: {
    label: 'Navegación principal',
    openMenu: 'Abrir menú',
    section: 'Menú',
  },
  theme: {
    dark: 'Modo oscuro',
  },
  dashboard: {
    title: 'Resumen',
    empty: 'Todavía no hay movimientos.',
    emptyHint:
      'Mientras tanto, puedes explorar la aplicación con datos de ejemplo desde «Ver la demo», en el menú.',
    kpis: 'Totales del mes',
    income: 'Ingresos',
    expense: 'Gastos',
    savings: 'Ahorro',
    balance: 'Balance',
    pending: 'Pendiente de cobrar',
    uncategorized: 'Sin categoría',
  },
  transactions: {
    title: 'Movimientos',
    caption: 'Movimientos de',
    region: 'Tabla de movimientos',
    bookedDate: 'Fecha',
    originalDate: 'Fecha original',
    dateChanged: '(fecha modificada)',
    description: 'Descripción',
    tags: 'Etiquetas',
    category: 'Categoría',
    subcategory: 'Subcategoría',
    account: 'Cuenta',
    amount: 'Importe',
    notes: 'Observaciones',
    shared: 'Compartido',
    reimbursement: 'Reembolso',
    transfer: 'Traspaso',
    installment: 'Cuota',
    search: 'Buscar',
    searchPlaceholder: 'Descripción, categoría, importe, fecha…',
    clearSearch: 'Borrar búsqueda',
    noResults: 'Ningún movimiento coincide con la búsqueda.',
    of: 'de',
  },
  period: {
    previous: 'Mes anterior',
    next: 'Mes siguiente',
    months: [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ],
  },
  demo: {
    banner: 'Modo demo: datos ficticios que no se guardan.',
    exit: 'Salir de la demo',
    open: 'Ver la demo',
    loading: 'Cargando la demo…',
    error: 'No se ha podido abrir la demo.',
  },
} as const;
