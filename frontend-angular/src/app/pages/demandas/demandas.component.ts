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

  filterCoordenadoria = signal('');
  filterMacro = signal('');
  filterPrioridade = signal('');
  filterStatus = signal('');
  filterResponsavel = signal('');
  searchText = signal('');
  showMinhaDemanda = signal(false);
  loading = signal(false);

  readonly PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
  readonly STATUS = ['pendente', 'em andamento', 'em revisão', 'concluída', 'cancelada', 'suspensa'];

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('coordenadoria_id')) this.filterCoordenadoria.set(qp.get('coordenadoria_id')!);
    if (qp.get('macro_backlog_id')) this.filterMacro.set(qp.get('macro_backlog_id')!);
    if (qp.get('prioridade')) this.filterPrioridade.set(qp.get('prioridade')!);
    if (qp.get('status')) this.filterStatus.set(qp.get('status')!);
    if (qp.get('responsavel_id')) this.filterResponsavel.set(qp.get('responsavel_id')!);

    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.filterCoordenadoria()) params['coordenadoria_id'] = this.filterCoordenadoria();
    if (this.filterMacro()) params['macro_backlog_id'] = this.filterMacro();
    if (this.filterPrioridade()) params['prioridade'] = this.filterPrioridade();
    if (this.filterStatus()) params['status'] = this.filterStatus();
    if (this.filterResponsavel()) params['responsavel_id'] = this.filterResponsavel();

    this.api.get<Demanda[]>('/demandas', params).subscribe({
      next: (list) => { this.demandas.set(list); this.loading.set(false); },
      error: () => { this.loading.set(false); }
    });
    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({ next: (c) => this.coordenadorias.set(c) });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: (m) => this.macroBacklogs.set(m) });
  }

  applyFilters(): void {
    const qp: Record<string, string> = {};
    if (this.filterCoordenadoria()) qp['coordenadoria_id'] = this.filterCoordenadoria();
    if (this.filterMacro()) qp['macro_backlog_id'] = this.filterMacro();
    if (this.filterPrioridade()) qp['prioridade'] = this.filterPrioridade();
    if (this.filterStatus()) qp['status'] = this.filterStatus();
    if (this.filterResponsavel()) qp['responsavel_id'] = this.filterResponsavel();
    this.router.navigate([], { queryParams: qp });
    this.loadData();
  }

  toggleMinhaDemanda(): void {
    this.showMinhaDemanda.update(v => !v);
  }

  clearFilters(): void {
    this.filterCoordenadoria.set('');
    this.filterMacro.set('');
    this.filterPrioridade.set('');
    this.filterStatus.set('');
    this.filterResponsavel.set('');
    this.searchText.set('');
    this.showMinhaDemanda.set(false);
    this.router.navigate([], { queryParams: {} });
    this.loadData();
  }

  get filteredDemandas(): Demanda[] {
    let list = this.demandas();
    if (this.showMinhaDemanda()) {
      const uid = this.userService.currentUser()?.id;
      list = list.filter(d => d.responsavel_id === uid || d.criador_id === uid);
    }
    const search = this.searchText().toLowerCase();
    if (search) list = list.filter(d => d.titulo.toLowerCase().includes(search));
    return list;
  }

  get pinnedDemandas(): Demanda[] {
    return this.filteredDemandas
      .filter(d => d.pinned)
      .sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0));
  }

  get unpinnedDemandas(): Demanda[] {
    return this.filteredDemandas.filter(d => !d.pinned);
  }

  onStatusChange(demanda: Demanda, newStatus: string): void {
    const uid = this.userService.currentUser()?.id;
    this.api.put<Demanda>(`/demandas/${demanda.id}/status`, { status: newStatus, usuario_id: uid }).subscribe({
      next: (updated) => {
        this.demandas.update(list => list.map(d => d.id === updated.id ? updated : d));
      }
    });
  }

  onPinToggle(demanda: Demanda): void {
    this.api.put<Demanda>(`/demandas/${demanda.id}/pin`, {}).subscribe({
      next: (updated) => {
        this.demandas.update(list => list.map(d => d.id === updated.id ? updated : d));
      }
    });
  }

  onDrop(event: CdkDragDrop<Demanda[]>): void {
    const pinned = [...this.pinnedDemandas];
    moveItemInArray(pinned, event.previousIndex, event.currentIndex);
    const orderItems = pinned.map((d, i) => ({ id: d.id, pin_order: i + 1 }));
    this.api.put<void>('/demandas/reorder', { orderItems }).subscribe({
      next: () => this.loadData()
    });
  }

  get isDiretor(): boolean {
    const role = this.userService.currentUser()?.role;
    return role === 'diretor' || role === 'admin';
  }

  priorityClass(p: string): string {
    const map: Record<string, string> = {
      'crítica': 'badge-priority-crítica',
      'alta': 'badge-priority-alta',
      'média': 'badge-priority-media',
      'baixa': 'badge-priority-baixa'
    };
    return map[p] ?? '';
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      'pendente': 'badge-status-pendente',
      'em andamento': 'badge-status-em-andamento',
      'concluída': 'badge-status-concluída',
      'cancelada': 'badge-status-cancelada',
      'suspensa': 'badge-status-suspensa'
    };
    return map[s] ?? '';
  }

  areaClass(coordenadoria_id: number): string {
    if (coordenadoria_id <= 3) return `area-card-${coordenadoria_id}`;
    return '';
  }

  cardStateClass(d: Demanda): string {
    if (d.status === 'concluída') return 'is-completed';
    if (d.status === 'cancelada') return 'is-cancelled';
    if (d.status === 'suspensa') return 'is-suspended';
    return '';
  }

  pendingDepsCount(d: Demanda): number {
    return (d.dependencias ?? []).filter((dep: any) => dep.status === 'pendente').length;
  }

  trackById(_: number, item: Demanda): number { return item.id; }
}
