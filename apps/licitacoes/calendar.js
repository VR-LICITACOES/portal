// ============================================
// CALENDAR MODAL FUNCTIONALITY (dias do mês)
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
    const daysContainer = document.getElementById('calendarDays');
    
    if (!yearMonthElement || !daysContainer) return;
    
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    yearMonthElement.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;
    
    // Obter dias que têm registros
    const diasComRegistros = new Set();
    licitacoes.forEach(l => {
        if (l.data) {
            const data = new Date(l.data);
            if (data.getFullYear() === calendarYear && data.getMonth() === calendarMonth) {
                diasComRegistros.add(data.getDate());
            }
        }
    });
    
    // Gerar grade de dias
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    
    let html = '<div class="calendar-weekdays">';
    ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(day => {
        html += `<div class="calendar-weekday">${day}</div>`;
    });
    html += '</div><div class="calendar-days-grid">';
    
    // Dias vazios do início
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Dias do mês
    for (let d = 1; d <= daysInMonth; d++) {
        const hasRecord = diasComRegistros.has(d);
        const isToday = (calendarYear === new Date().getFullYear() && 
                         calendarMonth === new Date().getMonth() && 
                         d === new Date().getDate());
        
        html += `<div class="calendar-day ${hasRecord ? 'has-record' : ''} ${isToday ? 'today' : ''}" 
                      onclick="selectDay(${d})">${d}</div>`;
    }
    
    html += '</div>';
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
