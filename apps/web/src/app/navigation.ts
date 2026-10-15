import {
  ArrowLeftRightIcon,
  BoxesIcon,
  FactoryIcon,
  GitForkIcon,
  LayersIcon,
  PackageIcon,
  SirenIcon,
  SproutIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavLinkItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface NavItem extends NavLinkItem {
  /** Rótulo do botão de criação (singular). */
  newLabel: string;
}

/** Operação de estoque (Semana 2). */
export const OPERATION_ITEMS: NavLinkItem[] = [
  {
    path: '/lotes',
    label: 'Lotes',
    description: 'Lotes recebidos, com qualidade, validade e saldo.',
    icon: BoxesIcon,
  },
  {
    path: '/estoque',
    label: 'Estoque',
    description: 'Saldo por lote e local.',
    icon: LayersIcon,
  },
  {
    path: '/movimentacoes',
    label: 'Movimentações',
    description: 'Razão de estoque: entradas, saídas, transferências e estornos.',
    icon: ArrowLeftRightIcon,
  },
];

/** Produção, expedição e rastreabilidade (Semana 3). */
export const PRODUCTION_ITEMS: NavLinkItem[] = [
  {
    path: '/producao',
    label: 'Produção',
    description: 'Ordens de beneficiamento, torra, blend e embalagem.',
    icon: FactoryIcon,
  },
  {
    path: '/expedicao',
    label: 'Expedição',
    description: 'Saídas de lotes para clientes.',
    icon: TruckIcon,
  },
  {
    path: '/rastreabilidade',
    label: 'Rastreabilidade',
    description: 'Origem e destino de cada lote, da fazenda ao cliente.',
    icon: GitForkIcon,
  },
];

/** Cadastros da Semana 1. */
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

/** Item de navegação de uma rota (falha cedo se a rota não existir). */
export function navItem(path: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`Rota de cadastro desconhecida: ${path}`);
  return item;
}

/** Módulos do roadmap, exibidos desabilitados na barra lateral. */
export const UPCOMING_ITEMS: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Recall', icon: SirenIcon },
];
