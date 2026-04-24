import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

export interface Demanda {
  id: number;
  titulo: string;
  descricao: string;
  coordenadoria_id: number;
  coordenadoria_nome: string;
  macro_backlog_id: number;
  macro_backlog_nome: string;
  prioridade: string;
  status: string;
  criador_id: number;
  criador_nome: string;
  responsavel_id: number;
  responsavel_nome: string;
  prazo: string;
  dominio: string;
  previsao_entrega: string;
  canal_origem: string;
  solicitante: string;
  setor_demandante: string;
  pinned: boolean;
  pin_order: number;
  flag_priorizacao_solicitada: boolean;
  justificativa_priorizacao?: string;
  created_at: string;
  concluded_at: string;
  dependencias: any[];
  historico: any[];
}

interface Coordenadoria { id: number; nome: string; }
interface MacroBacklog { id: number; nome: string; }

@Component({
  selector: 'app-demandas',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DragDropModule],
  templateUrl: './demandas.component.html'
})
export class DemandasComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  userService = inject(UserService);

  demandas = signal<Demanda[]>([]);
  coordenadorias = signal<Coordenadoria[]>([]);
  macroBacklogs = signal<MacroBacklog[]>([]);

  view = signal<'card' | 'table'>('table');
  tab = signal<'todas' | 'minhas' | 'fixadas'>('todas');
  filterCoordenadoria = signal('');
  filterMacro = signal('');
  filterPrioridade = signal('');
  filterStatus = signal('');
  searchText = signal('');
  loading = signal(false);
  currentPage = signal(1);
  readonly perPage = 10;

  sortKey = signal('id');
  sortDir = signal<'asc' | 'desc'>('asc');

  // Table drag state (HTML5)
  dragId = signal<number | null>(null);
  dragOverId = signal<number | null>(null);

  readonly PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
  readonly STATUS = ['pendente', 'em andamento', 'em revisão', 'concluída', 'cancelada', 'suspensa'];

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('coordenadoria_id')) this.filterCoordenadoria.set(qp.get('coordenadoria_id')!);
    if (qp.get('macro_backlog_id')) this.filterMacro.set(qp.get('macro_backlog_id')!);
    if (qp.get('prioridade')) this.filterPrioridade.set(qp.get('prioridade')!);
    if (qp.get('status')) this.filterStatus.set(qp.get('status')!);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.filterCoordenadoria()) params['coordenadoria_id'] = this.filterCoordenadoria();
    if (this.filterMacro()) params['macro_backlog_id'] = this.filterMacro();
    if (this.filterPrioridade()) params['prioridade'] = this.filterPrioridade();
    if (this.filterStatus()) params['status'] = this.filterStatus();

    this.api.get<Demanda[]>('/demandas', params).subscribe({
      next: (list) => { this.demandas.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({ next: (c) => this.coordenadorias.set(c) });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: (m) => this.macroBacklogs.set(m) });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    const qp: Record<string, string> = {};
    if (this.filterCoordenadoria()) qp['coordenadoria_id'] = this.filterCoordenadoria();
    if (this.filterMacro()) qp['macro_backlog_id'] = this.filterMacro();
    if (this.filterPrioridade()) qp['prioridade'] = this.filterPrioridade();
    if (this.filterStatus()) qp['status'] = this.filterStatus();
    this.router.navigate([], { queryParams: qp });
    this.loadData();
  }

  clearFilters(): void {
    this.filterCoordenadoria.set('');
    this.filterMacro.set('');
    this.filterPrioridade.set('');
    this.filterStatus.set('');
    this.searchText.set('');
    this.tab.set('todas');
    this.currentPage.set(1);
    this.router.navigate([], { queryParams: {} });
    this.loadData();
  }

  setTab(t: 'todas' | 'minhas' | 'fixadas'): void {
    this.tab.set(t);
    this.currentPage.set(1);
  }

  setView(v: 'card' | 'table'): void {
    this.view.set(v);
    this.currentPage.set(1);
  }

  toggleSort(key: string): void {
    if (this.sortKey() === key) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
    this.currentPage.set(1);
  }

  filteredAndSorted = computed(() => {
    let list = this.demandas();
    const tab = this.tab();
    const uid = this.userService.currentUser()?.id;

    if (tab === 'minhas') list = list.filter(d => d.responsavel_id === uid || d.criador_id === uid);
    if (tab === 'fixadas') list = list.filter(d => d.pinned);

    const search = this.searchText().toLowerCase();
    if (search) list = list.filter(d =>
      d.titulo.toLowerCase().includes(search) || String(d.id).includes(search)
    );

    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned && key === 'id') {
        return ((a.pin_order ?? 0) - (b.pin_order ?? 0));
      }
      const va = (a as any)[key];
      const vb = (b as any)[key];
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
  });

  pagedDemandas = computed(() => {
    const all = this.filteredAndSorted();
    const page = this.currentPage();
    return all.slice((page - 1) * this.perPage, page * this.perPage);
  });

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredAndSorted().length / this.perPage))
  );

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  pinnedCount = computed(() => this.demandas().filter(d => d.pinned).length);

  get pinnedForReorder(): Demanda[] {
    return this.filteredAndSorted()
      .filter(d => d.pinned)
      .sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0));
  }

  get unpinnedDemandas(): Demanda[] {
    return this.filteredAndSorted().filter(d => !d.pinned);
  }

  get canReorder(): boolean {
    return this.isDiretor && this.tab() === 'fixadas';
  }

  get isDiretor(): boolean {
    const role = this.userService.currentUser()?.role;
    return role === 'diretor' || role === 'admin';
  }

  onStatusChange(demanda: Demanda, newStatus: string): void {
    const uid = this.userService.currentUser()?.id;
    this.api.put<Demanda>(`/demandas/${demanda.id}/status`, { status: newStatus, usuario_id: uid }).subscribe({
      next: (updated) => this.demandas.update(list => list.map(d => d.id === updated.id ? updated : d))
    });
  }

  onPinToggle(demanda: Demanda): void {
    this.api.put<Demanda>(`/demandas/${demanda.id}/pin`, {}).subscribe({
      next: (updated) => this.demandas.update(list => list.map(d => d.id === updated.id ? updated : d))
    });
  }

  // CDK drop for card mode (pinned items)
  onDrop(event: CdkDragDrop<Demanda[]>): void {
    const pinned = [...this.pinnedForReorder];
    moveItemInArray(pinned, event.previousIndex, event.currentIndex);
    const orderItems = pinned.map((d, i) => ({ id: d.id, pin_order: i + 1 }));
    this.api.put<void>('/demandas/reorder', { orderItems }).subscribe({
      next: () => this.loadData()
    });
  }

  // HTML5 drag for table rows (pinned only, when canReorder)
  onRowDragStart(event: DragEvent, d: Demanda): void {
    this.dragId.set(d.id);
    event.dataTransfer!.effectAllowed = 'move';
  }

  onRowDragOver(event: DragEvent, d: Demanda): void {
    if (!this.canReorder) return;
    event.preventDefault();
    this.dragOverId.set(d.id);
  }

  onRowDrop(event: DragEvent, d: Demanda): void {
    event.preventDefault();
    const fromId = this.dragId();
    if (fromId == null || fromId === d.id) { this.clearDragState(); return; }
    const pinned = [...this.pinnedForReorder];
    const from = pinned.findIndex(x => x.id === fromId);
    const to = pinned.findIndex(x => x.id === d.id);
    if (from >= 0 && to >= 0) {
      const [moved] = pinned.splice(from, 1);
      pinned.splice(to, 0, moved);
      const orderItems = pinned.map((item, i) => ({ id: item.id, pin_order: i + 1 }));
      this.api.put<void>('/demandas/reorder', { orderItems }).subscribe({
        next: () => this.loadData()
      });
    }
    this.clearDragState();
  }

  onRowDragEnd(): void { this.clearDragState(); }

  clearDragState(): void {
    this.dragId.set(null);
    this.dragOverId.set(null);
  }

  // Helpers
  priorityClass(p: string): string {
    const map: Record<string, string> = {
      'crítica': 'b-prio-critica', 'alta': 'b-prio-alta',
      'média': 'b-prio-media', 'baixa': 'b-prio-baixa'
    };
    return map[p] ?? '';
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      'pendente': 'b-st-pendente', 'em andamento': 'b-st-andamento',
      'concluída': 'b-st-concluida', 'cancelada': 'b-st-cancelada',
      'suspensa': 'b-st-suspensa', 'em revisão': 'b-st-revisao'
    };
    return map[s] ?? '';
  }

  isCompleted(d: Demanda): boolean {
    return ['concluída', 'cancelada', 'suspensa'].includes(d.status);
  }

  pendingDepsCount(d: Demanda): number {
    return (d.dependencias ?? []).filter((dep: any) => dep.status === 'pendente').length;
  }

  depAreaNames(d: Demanda): string {
    const deps = d.dependencias ?? [];
    if (!deps.length) return '—';
    return deps.map((dep: any) => dep.coordenadoria_nome).filter(Boolean).join(', ');
  }

  fmtDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
  }

  prevPage(): void { if (this.currentPage() > 1) this.currentPage.update(p => p - 1); }
  nextPage(): void { if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1); }

  trackById(_: number, item: Demanda): number { return item.id; }
  trackByNum(_: number, n: number): number { return n; }
}
