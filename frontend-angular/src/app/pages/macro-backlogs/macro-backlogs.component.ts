import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { UserService } from '../../core/services/user.service';

interface Diretoria { id: number; nome: string; }
interface MacroBacklog { id: number; nome: string; diretoria_id?: number; }
interface Coordenadoria { id: number; nome: string; }

@Component({
  selector: 'app-macro-backlogs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './macro-backlogs.component.html'
})
export class MacroBacklogsComponent implements OnInit {
  private api = inject(ApiService);
  userService = inject(UserService);

  diretorias = signal<Diretoria[]>([]);
  selectedDiretoriaId = signal<number | null>(null);
  macros = signal<MacroBacklog[]>([]);
  coordenadorias = signal<Coordenadoria[]>([]);
  allMacros = signal<MacroBacklog[]>([]);

  loading = signal(false);
  error = signal('');

  // Create new macro
  newMacroNome = signal('');
  creating = signal(false);

  // Edit macro
  editingId = signal<number | null>(null);
  editNome = signal('');

  // Add to diretoria
  selectedMacroToAdd = signal<number | null>(null);

  ngOnInit(): void {
    this.api.get<Diretoria[]>('/diretorias').subscribe({ next: d => this.diretorias.set(d) });
    this.api.get<MacroBacklog[]>('/macro-backlogs').subscribe({ next: m => this.allMacros.set(m) });
  }

  selectDiretoria(id: number): void {
    this.selectedDiretoriaId.set(id);
    this.loading.set(true);
    this.api.get<MacroBacklog[]>(`/diretorias/${id}/macro-backlogs`).subscribe({
      next: m => { this.macros.set(m); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.api.get<Coordenadoria[]>(`/diretorias/${id}/coordenadorias`).subscribe({
      next: c => this.coordenadorias.set(c)
    });
  }

  createMacro(): void {
    if (!this.newMacroNome().trim()) return;
    this.creating.set(true);
    this.api.post<MacroBacklog>('/macro-backlogs', { nome: this.newMacroNome().trim() }).subscribe({
      next: (m) => {
        this.allMacros.update(list => [...list, m]);
        this.newMacroNome.set('');
        this.creating.set(false);
        if (this.selectedDiretoriaId()) this.selectDiretoria(this.selectedDiretoriaId()!);
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Erro ao criar.'); this.creating.set(false); }
    });
  }

  startEdit(m: MacroBacklog): void {
    this.editingId.set(m.id);
    this.editNome.set(m.nome);
  }

  saveEdit(m: MacroBacklog): void {
    if (!this.editNome().trim()) return;
    this.api.put<MacroBacklog>(`/macro-backlogs/${m.id}`, { nome: this.editNome().trim() }).subscribe({
      next: (updated) => {
        this.macros.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.allMacros.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.editingId.set(null);
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao editar.')
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  removeMacroFromDiretoria(m: MacroBacklog): void {
    const did = this.selectedDiretoriaId();
    if (!did) return;
    if (!confirm(`Remover "${m.nome}" da diretoria?`)) return;
    this.api.delete<void>(`/diretorias/${did}/macro-backlogs/${m.id}`).subscribe({
      next: () => this.macros.update(list => list.filter(x => x.id !== m.id)),
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao remover.')
    });
  }

  addMacroToDiretoria(): void {
    const did = this.selectedDiretoriaId();
    const mid = this.selectedMacroToAdd();
    if (!did || !mid) return;
    this.api.post<void>(`/diretorias/${did}/macro-backlogs`, { macro_backlog_id: mid }).subscribe({
      next: () => { this.selectedMacroToAdd.set(null); this.selectDiretoria(did); },
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao adicionar.')
    });
  }

  get availableMacros(): MacroBacklog[] {
    const current = new Set(this.macros().map(m => m.id));
    return this.allMacros().filter(m => !current.has(m.id));
  }
}
