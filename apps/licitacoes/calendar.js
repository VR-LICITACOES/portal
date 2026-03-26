// ============================================
// CALENDAR MODAL (dias do mês com registros)
// ============================================

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

function toggleCalendar() {
    const modal = document.getElementById('calendarModal');
    if (modal.classList.contains('show')) {
        modal.classList.remove('show');
    } else {
        calendarYear = currentMonth.getFullYear();
        calendarMonth = currentMonth.getMonth();
        renderCalendarDays();
        modal.classList.add('show');
    }
}

function changeCalendarMonth(direction) {
    calendarMonth += direction;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    } else if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    }
    renderCalendarDays();
}

function renderCalendarDays() {
    const monthYearElement = document.getElementById('calendarMonthYear');
    const daysContainer = document.getElementById('calendarDays');

    if (!monthYearElement || !daysContainer) return;

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    monthYearElement.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

    const diasComRegistros = new Set();
    licitacoes.forEach(l => {
        if (l.data) {
            // Usa split para evitar problemas de fuso horário
            const [y, m, d] = l.data.split('-').map(Number);
            if (y === calendarYear && (m - 1) === calendarMonth) {
                diasComRegistros.add(d);
            }
        }
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    // Data selecionada atualmente (para marcar o dia ativo)
    let selectedDay = null;
    if (currentDateFilter) {
        const [fy, fm, fd] = currentDateFilter.split('-').map(Number);
        if (fy === calendarYear && (fm - 1) === calendarMonth) {
            selectedDay = fd;
        }
    }

    const today = new Date();
    let html = '';
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const hasRecord = diasComRegistros.has(d);
        const isToday = (calendarYear === today.getFullYear() &&
                         calendarMonth === today.getMonth() &&
                         d === today.getDate());
        const isSelected = d === selectedDay;

        html += `<div class="calendar-day ${hasRecord ? 'has-record' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected-day' : ''}"
                      onclick="selectDay(${d})">${d}</div>`;
    }
    daysContainer.innerHTML = html;
}

function selectDay(day) {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    const dateStr = selectedDate.toISOString().split('T')[0];

    // Toggle: se o dia já está selecionado, remove o filtro
    if (currentDateFilter === dateStr) {
        currentDateFilter = null;
    } else {
        currentDateFilter = dateStr;
        // Atualiza o mês exibido para o mês da data selecionada
        currentMonth = new Date(calendarYear, calendarMonth, 1);
        updateMonthDisplay();
    }

    // Fecha o calendário
    const modal = document.getElementById('calendarModal');
    if (modal) modal.classList.remove('show');

    // Se o mês do calendário é diferente do mês atual carregado, recarrega
    const mesAtual = currentMonth.getMonth() + 1;
    const anoAtual = currentMonth.getFullYear();
    if (calendarMonth + 1 !== mesAtual || calendarYear !== anoAtual) {
        loadLicitacoes().then(() => filterLicitacoes());
    } else {
        filterLicitacoes();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('calendarModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
});
