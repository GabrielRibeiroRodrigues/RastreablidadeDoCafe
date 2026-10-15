import {
  ArrowLeftRightIcon,
  BoxesIcon,
  FactoryIcon,
  PackageIcon,
  SirenIcon,
  SproutIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  /** Rótulo do botão de criação (singular). */
  newLabel: string;
  description: string;
  icon: LucideIcon;
}

/** Cadastros da Semana 1. As telas reais chegam com o cliente OpenAPI. */
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/produtos',
    label: 'Produtos',
    newLabel: 'Novo produto',
    description: 'Café verde, torrado, blends e embalagens, com SKU e unidade de medida.',
    icon: PackageIcon,
  },
  {
    path: '/fornecedores',
    label: 'Fornecedores',
    newLabel: 'Novo fornecedor',
    description: 'Produtores e fazendas de origem: região, altitude e variedades cultivadas.',
    icon: SproutIcon,
  },
  {
    path: '/clientes',
    label: 'Clientes',
    newLabel: 'Novo cliente',
    description: 'Quem recebe as expedições — base para o recall rastrear o destino de cada lote.',
    icon: UsersIcon,
  },
  {
    path: '/locais',
    label: 'Locais',
    newLabel: 'Novo local',
    description: 'Armazéns, silos e áreas de quarentena onde os lotes ficam estocados.',
    icon: WarehouseIcon,
  },
];

/** Módulos do roadmap, exibidos desabilitados na barra lateral. */
export const UPCOMING_ITEMS: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Lotes', icon: BoxesIcon },
  { label: 'Movimentações', icon: ArrowLeftRightIcon },
  { label: 'Produção', icon: FactoryIcon },
  { label: 'Expedição', icon: TruckIcon },
  { label: 'Recall', icon: SirenIcon },
];
