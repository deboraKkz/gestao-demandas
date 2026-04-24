import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from './core/services/api.service';
import { UserService, Usuario } from './core/services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  private api = inject(ApiService);
  userService = inject(UserService);

  users = signal<Usuario[]>([]);
  selectedUserId = signal<number | null>(null);
  menuOpen = signal(false);

  ngOnInit(): void {
    this.api.get<Usuario[]>('/auth/users').subscribe({
      next: (list) => {
        this.users.set(list);
        if (list.length > 0) {
          const first = list[0];
          this.selectedUserId.set(first.id);
          this.userService.setUser(first);
        }
      },
      error: () => {}
    });
  }

  onUserChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedUserId.set(id);
    const user = this.users().find(u => u.id === id) ?? null;
    this.userService.setUser(user);
    this.menuOpen.set(false);
  }

  toggleMenu(): void {
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  get isDiretor(): boolean {
    const role = this.userService.currentUser()?.role;
    return role === 'diretor' || role === 'admin';
  }

  get isAdmin(): boolean {
    return this.userService.currentUser()?.role === 'admin';
  }
}
