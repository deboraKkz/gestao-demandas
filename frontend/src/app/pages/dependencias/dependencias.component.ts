import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

interface DepItem {
  id: number;
  demanda_id: number;
  demanda_titulo: string;
  coordenadoria_id: number;
  coordenadoria_nome: string;
  status: string;
  detalhes: string;
  demanda_filha_id: number | null;
  prioridade?: string;
  responsavel_nome?: string;
  created_at?: string;
}

interface DepGrupo {
  coordenadoria_id: number;
  coordenadoria_nome: string;
  dependencias: DepItem[];
}

@Component({
  selector: 'app-dependencias',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  templateUrl: './dependencias.component.html',
  providers: [DatePipe]
})
export class DependenciasComponent implements OnInit {
  private api = inject(ApiService);
  userService = inject(UserService);

  grupos = signal<DepGrupo[]>([]);
  loading = signal(true);
  error = signal('');
  processing = signal<Set<number>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<DepGrupo[]>('/dependencias').subscribe({
      next: (data) => { this.grupos.set(data); this.loading.set(false); },
      error: () => { this.error.set('Erro ao carregar dependências.'); this.loading.set(false); }
    });
  }

  get pendingGrupos(): DepGrupo[] {
    return this.grupos()
      .map(g => ({ ...g, dependencias: g.dependencias.filter(d => d.status === 'pendente') }))
      .filter(g => g.dependencias.length > 0);
  }

  concluir(dep: DepItem): void {
    const uid = this.userService.currentUser()?.id;
    this.processing.update(s => { s.add(dep.id); return new Set(s); });
    this.api.post<void>(`/dependencias/${dep.id}/concluir`, { usuario_id: uid }).subscribe({
      next: () => { this.processing.update(s => { s.delete(dep.id); return new Set(s); }); this.load(); },
      error: () => { this.processing.update(s => { s.delete(dep.id); return new Set(s); }); }
    });
  }

  rejeitar(dep: DepItem): void {
    const uid = this.userService.currentUser()?.id;
    this.processing.update(s => { s.add(dep.id); return new Set(s); });
    this.api.post<void>(`/dependencias/${dep.id}/rejeitar`, { usuario_id: uid }).subscribe({
      next: () => { this.processing.update(s => { s.delete(dep.id); return new Set(s); }); this.load(); },
      error: () => { this.processing.update(s => { s.delete(dep.id); return new Set(s); }); }
    });
  }

  isProcessing(id: number): boolean {
    return this.processing().has(id);
  }

  areaHeaderClass(id: number): string {
    if (id <= 3) return `area-header-${id}`;
    return '';
  }

  areaDotClass(id: number): string {
    if (id <= 3) return `area-dot-${id}`;
    return '';
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
