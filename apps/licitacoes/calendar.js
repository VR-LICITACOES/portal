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
            const data = new Date(l.data);
            if (data.getFullYear() === calendarYear && data.getMonth() === calendarMonth) {
                diasComRegistros.add(data.getDate());
            }
        }
    });
    
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    
    let html = '';
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const hasRecord = diasComRegistros.has(d);
        const isToday = (calendarYear === new Date().getFullYear() && 
                         calendarMonth === new Date().getMonth() && 
                         d === new Date().getDate());
        
        html += `<div class="calendar-day ${hasRecord ? 'has-record' : ''} ${isToday ? 'today' : ''}" 
                      onclick="selectDay(${d})">${d}</div>`;
    }
    daysContainer.innerHTML = html;
}

function selectDay(day) {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    // Aplica o filtro de data sem alterar a barra de pesquisa
    currentDateFilter = dateStr;
    
    // Atualiza o mês exibido para o mês da data selecionada
    currentMonth = new Date(calendarYear, calendarMonth, 1);
    updateMonthDisplay();
    
    // Recarrega as propostas do mês (já filtradas pelo servidor)
    loadLicitacoes().then(() => {
        // Aplica o filtro de data na lista já carregada
        filterLicitacoes();
    });
    
    toggleCalendar();
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
