import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

interface Dependencia {
  id: number;
  demanda_id: number;
  coordenadoria_id: number;
  coordenadoria_nome: string;
  status: string;
  detalhes: string;
  demanda_filha_id: number;
}

interface HistoricoEvento {
  id: number;
  tipo: string;
  usuario_nome: string;
  payload: any;
  created_at: string;
}

interface Demanda {
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
  dependencias: Dependencia[];
  historico: HistoricoEvento[];
  demanda_mae_id?: number;
  demanda_mae_titulo?: string;
}

interface Coordenadoria { id: number; nome: string; }
interface MacroBacklog { id: number; nome: string; }
interface Usuario { id: number; nome: string; role: string; }

@Component({
  selector: 'app-demanda-detalhes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DatePipe],
  templateUrl: './demanda-detalhes.component.html',
  providers: [DatePipe]
})
export class DemandaDetalhesComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  userService = inject(UserService);

  demanda = signal<Demanda | null>(null);
  loading = signal(true);
  editMode = signal(false);
  saving = signal(false);
  error = signal('');

  coordenadorias = signal<Coordenadoria[]>([]);
  macroBacklogs = signal<MacroBacklog[]>([]);
  usuarios = signal<Usuario[]>([]);

  editForm: Partial<Demanda> = {};

  readonly PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
  readonly STATUS = ['pendente', 'em andamento', 'em revisão', 'concluída', 'cancelada', 'suspensa'];
  readonly CANAIS = ['SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams'];
  readonly DOMINIOS = ['Judicial', 'Administrativo', 'Misto'];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.get<Demanda>(`/demandas/${id}`).subscribe({
      next: (d) => { this.demanda.set(d); this.loading.set(false); },
      error: () => { this.error.set('Demanda não encontrada.'); this.loading.set(false); }
    });
    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({ next: c => this.coordenadorias.set(c) });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: m => this.macroBacklogs.set(m) });
    this.api.get<Usuario[]>('/auth/users').subscribe({ next: u => this.usuarios.set(u) });
  }

  startEdit(): void {
    const d = this.demanda();
    if (!d) return;
    this.editForm = { ...d };
    this.editMode.set(true);
  }

  cancelEdit(): void {
    this.editMode.set(false);
    this.error.set('');
  }

  saveEdit(): void {
    const d = this.demanda();
    if (!d) return;
    this.saving.set(true);
    const body = { ...this.editForm, usuario_id: this.userService.currentUser()?.id };
    this.api.put<Demanda>(`/demandas/${d.id}`, body).subscribe({
      next: (updated) => {
        this.demanda.set(updated);
        this.editMode.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Erro ao salvar.');
        this.saving.set(false);
      }
    });
  }

  deleteDemanda(): void {
    const d = this.demanda();
    if (!d) return;
    if (!confirm(`Excluir demanda "${d.titulo}"?`)) return;
    this.api.delete<void>(`/demandas/${d.id}`).subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.error.set('Erro ao excluir.')
    });
  }

  solicitarPriorizacao(): void {
    const d = this.demanda();
    if (!d) return;
    const body = {
      solicitar_priorizacao: true,
      usuario_id: this.userService.currentUser()?.id
    };
    this.api.put<Demanda>(`/demandas/${d.id}`, body).subscribe({
      next: (updated) => this.demanda.set(updated)
    });
  }

  labelEvento(evento: HistoricoEvento): string {
    const p = evento.payload ?? {};
    switch (evento.tipo) {
      case 'criada': return 'Demanda cadastrada';
      case 'status_alterado': return `Status: ${p.de} → ${p.para}`;
      case 'coordenadoria_alterada': return `Coordenadoria: ${p.de_nome} → ${p.para_nome}`;
      case 'priorizacao_aprovada': return 'Priorização aprovada';
      case 'priorizacao_rejeitada': return 'Priorização rejeitada';
      case 'dependencia_cadastrada': return `Dependência cadastrada: ${p.coordenadoria_nome}`;
      case 'dependencia_concluida': return `Dependência concluída: ${p.coordenadoria_nome}`;
      case 'dependencia_rejeitada': return `Dependência rejeitada: ${p.coordenadoria_nome}`;
      default: return evento.tipo;
    }
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

  depStatusClass(s: string): string {
    if (s === 'concluida') return 'badge-status-concluída';
    if (s === 'rejeitada') return 'badge-status-cancelada';
    return 'badge-status-pendente';
  }

  navigateToMae(): void {
    const d = this.demanda();
    if (d?.demanda_mae_id) this.router.navigate(['/demandas', d.demanda_mae_id]);
  }
}
