// ============================================
// CALENDAR MODAL – EXIBE APENAS DIAS COM REGISTROS
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

function changeCalendarYear(direction) {
    calendarYear += direction;
    renderCalendarDays();
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
    const yearMonthElement = document.getElementById('calendarYearMonth');
    const daysContainer = document.getElementById('calendarDaysList');
    
    if (!yearMonthElement || !daysContainer) return;
    
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    yearMonthElement.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;
    
    // Filtrar licitações do mês/ano selecionado
    const licitacoesDoMes = licitacoes.filter(l => {
        if (!l.data) return false;
        const data = new Date(l.data);
        return data.getFullYear() === calendarYear && data.getMonth() === calendarMonth;
    });
    
    // Extrair dias únicos ordenados
    const diasUnicos = [...new Set(licitacoesDoMes.map(l => new Date(l.data).getDate()))];
    diasUnicos.sort((a, b) => a - b);
    
    // Construir lista de dias
    if (diasUnicos.length === 0) {
        daysContainer.innerHTML = '<div style="text-align:center; padding:1rem; color: var(--text-secondary);">Nenhuma proposta neste mês</div>';
        return;
    }
    
    let html = '';
    diasUnicos.forEach(day => {
        html += `<div class="calendar-day-item" onclick="selectDay(${day})">${day}</div>`;
    });
    daysContainer.innerHTML = html;
}

function selectDay(day) {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    currentMonth = selectedDate;
    isAllMonths = false;
    updateMonthDisplay();
    loadLicitacoes();
    toggleCalendar();
}

// Fechar o calendário ao clicar fora dele
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

// Função para atualizar o calendário se estiver aberto (chamada após carregar licitações)
function refreshCalendarIfOpen() {
    const modal = document.getElementById('calendarModal');
    if (modal && modal.classList.contains('show')) {
        renderCalendarDays();
    }
}
