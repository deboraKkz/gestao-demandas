import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

interface Coordenadoria { id: number; nome: string; }
interface MacroBacklog { id: number; nome: string; }
interface Usuario { id: number; nome: string; role: string; coordenadoria_id: number; }
interface Dependencia { id: number; coordenadoria_id: number; coordenadoria_nome: string; status: string; }

interface DepForm {
  coordenadoria_id: number;
  coordenadoria_nome: string;
  detalhes: string;
  selected: boolean;
}

@Component({
  selector: 'app-nova-demanda',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './nova-demanda.component.html'
})
export class NovaDemandaComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  userService = inject(UserService);

  coordenadorias = signal<Coordenadoria[]>([]);
  macroBacklogs = signal<MacroBacklog[]>([]);
  usuarios = signal<Usuario[]>([]);

  depMode = signal(false);
  dependenciaId = signal<number | null>(null);
  dependencia = signal<Dependencia | null>(null);

  submitting = signal(false);
  error = signal('');

  // Responsavel combobox
  responsavelSearch = signal('');
  responsavelDropdownOpen = signal(false);
  selectedResponsavel = signal<Usuario | null>(null);

  form = {
    titulo: '',
    descricao: '',
    coordenadoria_id: '',
    macro_backlog_id: '',
    prioridade: 'média',
    canal_origem: '',
    solicitante: '',
    setor_demandante: '',
    responsavel_id: '',
    prazo: '',
    dominio: '',
    previsao_entrega: '',
    solicitar_priorizacao: false,
    justificativa_priorizacao: '',
    prioridade_solicitada: 'alta'
  };

  depForms: DepForm[] = [];

  readonly PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
  readonly CANAIS = ['SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams'];
  readonly DOMINIOS = ['Judicial', 'Administrativo', 'Misto'];

  ngOnInit(): void {
    const depId = this.route.snapshot.queryParamMap.get('dependencia');
    if (depId) {
      this.depMode.set(true);
      this.dependenciaId.set(Number(depId));
      this.api.get<Dependencia>(`/dependencias/${depId}`).subscribe({
        next: (d) => { this.dependencia.set(d); }
      });
    }

    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({
      next: (list) => {
        this.coordenadorias.set(list);
        this.depForms = list.map(c => ({
          coordenadoria_id: c.id,
          coordenadoria_nome: c.nome,
          detalhes: '',
          selected: false
        }));
      }
    });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: m => this.macroBacklogs.set(m) });
    this.api.get<Usuario[]>('/auth/users').subscribe({ next: u => this.usuarios.set(u) });
  }

  get filteredUsuarios(): Usuario[] {
    const s = this.responsavelSearch().toLowerCase();
    return this.usuarios().filter(u => u.nome.toLowerCase().includes(s));
  }

  selectResponsavel(u: Usuario): void {
    this.selectedResponsavel.set(u);
    this.form.responsavel_id = String(u.id);
    this.responsavelSearch.set(u.nome);
    this.responsavelDropdownOpen.set(false);
  }

  onResponsavelInput(): void {
    this.responsavelDropdownOpen.set(true);
    if (!this.responsavelSearch()) {
      this.selectedResponsavel.set(null);
      this.form.responsavel_id = '';
    }
  }

  submit(): void {
    this.error.set('');
    if (!this.form.titulo.trim()) { this.error.set('Título é obrigatório.'); return; }

    const uid = this.userService.currentUser()?.id;
    const deps = this.depForms
      .filter(d => d.selected)
      .map(d => ({ coordenadoria_id: d.coordenadoria_id, detalhes: d.detalhes }));

    const body: Record<string, unknown> = {
      ...this.form,
      coordenadoria_id: Number(this.form.coordenadoria_id) || undefined,
      macro_backlog_id: Number(this.form.macro_backlog_id) || undefined,
      responsavel_id: Number(this.form.responsavel_id) || undefined,
      criador_id: uid,
      dependencias: deps
    };

    this.submitting.set(true);

    if (this.depMode() && this.dependenciaId()) {
      this.api.post<any>(`/dependencias/${this.dependenciaId()}/demanda-filha`, body).subscribe({
        next: (d) => { this.submitting.set(false); this.router.navigate(['/demandas', d.id]); },
        error: (e) => { this.error.set(e?.error?.message ?? 'Erro ao criar demanda.'); this.submitting.set(false); }
      });
    } else {
      this.api.post<any>('/demandas', body).subscribe({
        next: (d) => { this.submitting.set(false); this.router.navigate(['/demandas', d.id]); },
        error: (e) => { this.error.set(e?.error?.message ?? 'Erro ao criar demanda.'); this.submitting.set(false); }
      });
    }
  }
}
