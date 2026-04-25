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

  // All filters are now CLIENT-SIDE — no server round-trip on filter change
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

  // Custom drag order: maps demand id → sort index (overrides column sort)
  customOrderMap = signal<Map<number, number>>(new Map());

  // Table drag state (HTML5)
  dragId = signal<number | null>(null);
  dragOverId = signal<number | null>(null);

  readonly PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
  readonly STATUS = ['pendente', 'em andamento', 'em revisão', 'concluída', 'cancelada', 'suspensa'];

  ngOnInit(): void {
    // Read initial filters from URL
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('coordenadoria_id')) this.filterCoordenadoria.set(qp.get('coordenadoria_id')!);
    if (qp.get('macro_backlog_id')) this.filterMacro.set(qp.get('macro_backlog_id')!);
    if (qp.get('prioridade')) this.filterPrioridade.set(qp.get('prioridade')!);
    if (qp.get('status')) this.filterStatus.set(qp.get('status')!);
    this.loadData();
  }

  // Always loads ALL demands — filtering is 100% client-side
  loadData(): void {
    this.loading.set(true);
    this.api.get<Demanda[]>('/demandas').subscribe({
      next: (list) => {
        this.demandas.set(list);
        this.loading.set(false);
        // Reset drag order when data reloads
        this.customOrderMap.set(new Map());
      },
      error: () => this.loading.set(false)
    });
    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({ next: (c) => this.coordenadorias.set(c) });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: (m) => this.macroBacklogs.set(m) });
  }

  // Update URL params only — no server reload needed
  applyFilters(): void {
    this.currentPage.set(1);
    const qp: Record<string, string> = {};
    if (this.filterCoordenadoria()) qp['coordenadoria_id'] = this.filterCoordenadoria();
    if (this.filterMacro()) qp['macro_backlog_id'] = this.filterMacro();
    if (this.filterPrioridade()) qp['prioridade'] = this.filterPrioridade();
    if (this.filterStatus()) qp['status'] = this.filterStatus();
    this.router.navigate([], { queryParams: qp });
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
    this.customOrderMap.set(new Map()); // Column sort overrides drag order
  }

  // All filtering + sorting in one computed — fully client-side
  filteredAndSorted = computed(() => {
    let list = this.demandas();
    const tab = this.tab();
    const uid = this.userService.currentUser()?.id;

    // Tab filter
    if (tab === 'minhas') list = list.filter(d => d.responsavel_id === uid || d.criador_id === uid);
    if (tab === 'fixadas') list = list.filter(d => d.pinned);

    // Text search
    const search = this.searchText().toLowerCase();
    if (search) list = list.filter(d =>
      d.titulo.toLowerCase().includes(search) || String(d.id).includes(search)
    );

    // Dropdown filters (client-side)
    const fc = this.filterCoordenadoria();
    const fm = this.filterMacro();
    const fp = this.filterPrioridade();
    const fs = this.filterStatus();
    if (fc) list = list.filter(d => String(d.coordenadoria_id) === String(fc));
    if (fm) list = list.filter(d => String(d.macro_backlog_id) === String(fm));
    if (fp) list = list.filter(d => d.prioridade === fp);
    if (fs) list = list.filter(d => d.status === fs);

    // Sort
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const orderMap = this.customOrderMap();

    return [...list].sort((a, b) => {
      // Pinned items always float to top
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      // Custom drag order overrides column sort
      if (orderMap.size > 0) {
        const oa = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
        const ob = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
        if (oa !== ob) return oa - ob;
      }

      // Column sort
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

  get isDiretor(): boolean {
    const role = this.userService.currentUser()?.role;
    return role === 'diretor' || role === 'admin';
  }

  // ── Pin toggle ─────────────────────────────────────────────────────────────
  // Optimistic update: toggle locally first, then sync with server.
  // (Backend returns { success, pinned }, NOT the full Demanda object)
  onPinToggle(demanda: Demanda): void {
    const newPinned = !demanda.pinned;
    const currentPinnedCount = this.demandas().filter(d => d.pinned).length;
    this.demandas.update(list =>
      list.map(d => d.id === demanda.id
        ? { ...d, pinned: newPinned, pin_order: newPinned ? currentPinnedCount + 1 : 0 }
        : d
      )
    );
    this.api.put<any>(`/demandas/${demanda.id}/pin`, {}).subscribe({
      error: () => {
        // Revert on server error
        this.demandas.update(list => list.map(d => d.id === demanda.id ? { ...demanda } : d));
      }
    });
  }

  // ── Status change ──────────────────────────────────────────────────────────
  onStatusChange(demanda: Demanda, newStatus: string): void {
    const uid = this.userService.currentUser()?.id;
    this.api.put<Demanda>(`/demandas/${demanda.id}/status`, { status: newStatus, usuario_id: uid }).subscribe({
      next: (updated) => {
        if (updated?.id) {
          this.demandas.update(list => list.map(d => d.id === updated.id ? updated : d));
        } else {
          // Fallback: update status optimistically
          this.demandas.update(list => list.map(d => d.id === demanda.id ? { ...d, status: newStatus } : d));
        }
      }
    });
  }

  // ── Drag reorder: shared logic ─────────────────────────────────────────────
  private applyReorder(fromId: number, toId: number): void {
    const all = this.filteredAndSorted();
    const fromIdx = all.findIndex(x => x.id === fromId);
    const toIdx = all.findIndex(x => x.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const reordered = [...all];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Store custom order
    const newMap = new Map<number, number>();
    reordered.forEach((d, i) => newMap.set(d.id, i));
    this.customOrderMap.set(newMap);

    // Persist pinned order to server
    const pinnedInOrder = reordered.filter(d => d.pinned);
    if (pinnedInOrder.length > 0) {
      const orderItems = pinnedInOrder.map((d, i) => ({ id: d.id, pin_order: i + 1 }));
      this.api.put<void>('/demandas/reorder', { orderItems }).subscribe();
    }
  }

  // CDK drop for card mode (all items)
  onDrop(event: CdkDragDrop<Demanda[]>): void {
    const all = this.filteredAndSorted();
    if (event.previousIndex === event.currentIndex) return;
    const fromId = all[event.previousIndex]?.id;
    const toId = all[event.currentIndex]?.id;
    if (fromId != null && toId != null) this.applyReorder(fromId, toId);
  }

  // HTML5 drag for table rows (all rows)
  onRowDragStart(event: DragEvent, d: Demanda): void {
    this.dragId.set(d.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onRowDragOver(event: DragEvent, d: Demanda): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragOverId() !== d.id) this.dragOverId.set(d.id);
  }

  onRowDrop(event: DragEvent, d: Demanda): void {
    event.preventDefault();
    const fromId = this.dragId();
    if (fromId != null && fromId !== d.id) this.applyReorder(fromId, d.id);
    this.clearDragState();
  }

  onRowDragEnd(): void { this.clearDragState(); }

  clearDragState(): void {
    this.dragId.set(null);
    this.dragOverId.set(null);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
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
