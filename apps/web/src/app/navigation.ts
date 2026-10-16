import {
  ArrowLeftRightIcon,
  BoxesIcon,
  ClipboardCheckIcon,
  FactoryIcon,
  FileSpreadsheetIcon,
  GitForkIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PackageIcon,
  PackagePlusIcon,
  ScrollTextIcon,
  SirenIcon,
  SproutIcon,
  TruckIcon,
  UploadIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@traceflow/shared';

export interface NavLinkItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Só aparece para quem opera o estoque (admin e operador). */
  requiresOperate?: boolean;
  /** Só aparece para estes perfis (ex.: Auditoria para admin e auditor). */
  roles?: readonly Role[];
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

/** Qualidade e conformidade. */
export const QUALITY_ITEMS: NavLinkItem[] = [
  {
    path: '/recall',
    label: 'Recall',
    description: 'Recolhimento de um lote e seus derivados: bloqueio, relatório e clientes.',
    icon: SirenIcon,
  },
  {
    path: '/qualidade',
    label: 'Qualidade',
    description: 'Não conformidades: quarentena, liberação e descarte de lotes.',
    icon: ClipboardCheckIcon,
  },
  {
    path: '/auditoria',
    label: 'Auditoria',
    description: 'Trilha de auditoria: quem fez o quê e quando.',
    icon: ScrollTextIcon,
    roles: ['admin', 'auditor'],
  },
];

/** Relatórios e importação. */
export const MANAGEMENT_ITEMS: NavLinkItem[] = [
  {
    path: '/relatorios',
    label: 'Relatórios',
    description: 'Planilhas CSV de estoque, movimentações, produção e expedições.',
    icon: FileSpreadsheetIcon,
  },
  {
    path: '/importacao',
    label: 'Importação',
    description: 'Carga de cadastros por planilha CSV.',
    icon: UploadIcon,
    roles: ['admin'],
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
  { title: 'Gestão', items: MANAGEMENT_ITEMS },
];

/** Item de navegação de uma rota (falha cedo se a rota não existir). */
export function navItem(path: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`Rota de cadastro desconhecida: ${path}`);
  return item;
}

/** O perfil vê o item? (`requiresOperate` e `roles`). */
export function canSeeNavItem(
  item: NavLinkItem,
  roles: readonly Role[],
  canOperate: boolean,
): boolean {
  if (item.requiresOperate && !canOperate) return false;
  return !item.roles || item.roles.some((role) => roles.includes(role));
}
