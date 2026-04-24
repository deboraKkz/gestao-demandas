import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

interface Priorizacao {
  id: number;
  demanda_id: number;
  demanda_titulo: string;
  solicitante_nome: string;
  justificativa: string;
  prioridade_solicitada: string;
  status: string;
  created_at: string;
}

@Component({
  selector: 'app-priorizacoes',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  templateUrl: './priorizacoes.component.html',
  providers: [DatePipe]
})
export class PriorizacoesComponent implements OnInit {
  private api = inject(ApiService);
  userService = inject(UserService);

  priorizacoes = signal<Priorizacao[]>([]);
  loading = signal(true);
  error = signal('');
  processing = signal<Set<number>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Priorizacao[]>('/priorizacoes').subscribe({
      next: (list) => { this.priorizacoes.set(list); this.loading.set(false); },
      error: () => { this.error.set('Erro ao carregar priorizações.'); this.loading.set(false); }
    });
  }

  get pendingPriorizacoes(): Priorizacao[] {
    return this.priorizacoes().filter(p => p.status === 'pendente');
  }

  decidir(p: Priorizacao, aprovado: boolean): void {
    const diretor_id = this.userService.currentUser()?.id;
    this.processing.update(s => { s.add(p.id); return new Set(s); });
    this.api.post<void>(`/priorizacoes/${p.id}/decisao`, { aprovado, diretor_id }).subscribe({
      next: () => { this.processing.update(s => { s.delete(p.id); return new Set(s); }); this.load(); },
      error: () => { this.processing.update(s => { s.delete(p.id); return new Set(s); }); }
    });
  }

  isProcessing(id: number): boolean {
    return this.processing().has(id);
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
}
