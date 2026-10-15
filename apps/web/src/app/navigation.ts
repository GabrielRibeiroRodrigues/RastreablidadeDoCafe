import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ClipboardCheckIcon,
  FactoryIcon,
  GitForkIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PackageIcon,
  PackagePlusIcon,
  ScrollTextIcon,
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
  /** Só aparece para quem opera o estoque (admin e operador). */
  requiresOperate?: boolean;
  /** Módulo ainda não entregue: aparece com o selo "Em breve". */
  soon?: boolean;
}

export interface NavItem extends NavLinkItem {
  /** Rótulo do botão de criação (singular). */
  newLabel: string;
}

export interface NavSection {
  title: string;
  items: NavLinkItem[];
}

export const DASHBOARD_ITEM: NavLinkItem = {
  path: '/',
  label: 'Painel',
  description: 'Visão geral do estoque, da produção e das expedições.',
  icon: LayoutDashboardIcon,
};

/** Fluxo operacional: entrada, transformação e saída. */
export const OPERATION_ITEMS: NavLinkItem[] = [
  {
    path: '/recebimento',
    label: 'Recebimento',
    description: 'Entrada de café de um fornecedor: cria o lote e o saldo inicial.',
    icon: PackagePlusIcon,
    requiresOperate: true,
  },
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
];

/** Estoque e rastreabilidade. */
export const STOCK_ITEMS: NavLinkItem[] = [
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
  {
    path: '/rastreabilidade',
    label: 'Rastreabilidade',
    description: 'Origem e destino de cada lote, da fazenda ao cliente.',
    icon: GitForkIcon,
  },
];

/** Qualidade e conformidade (módulos em construção). */
export const QUALITY_ITEMS: NavLinkItem[] = [
  {
    path: '/recall',
    label: 'Recall',
    description: 'Simulação de recall: quais clientes receberam um lote e seus derivados.',
    icon: SirenIcon,
    soon: true,
  },
  {
    path: '/qualidade',
    label: 'Qualidade',
    description: 'Não conformidades: registro, análise e tratamento.',
    icon: ClipboardCheckIcon,
    soon: true,
  },
  {
    path: '/auditoria',
    label: 'Auditoria',
    description: 'Trilha de auditoria: quem fez o quê e quando.',
    icon: ScrollTextIcon,
    soon: true,
  },
];

/** Cadastros. */
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

/** Seções da barra lateral, na ordem de exibição. */
export const NAV_SECTIONS: NavSection[] = [
  { title: 'Visão geral', items: [DASHBOARD_ITEM] },
  { title: 'Operação', items: OPERATION_ITEMS },
  { title: 'Estoque', items: STOCK_ITEMS },
  { title: 'Qualidade', items: QUALITY_ITEMS },
  { title: 'Cadastros', items: NAV_ITEMS },
];

/** Item de navegação de uma rota (falha cedo se a rota não existir). */
export function navItem(path: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`Rota de cadastro desconhecida: ${path}`);
  return item;
}

/** Item de qualquer seção (para páginas "Em breve"). */
export function findNavLink(path: string): NavLinkItem | undefined {
  return NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.path === path);
}
