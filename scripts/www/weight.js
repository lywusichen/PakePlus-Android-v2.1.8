// Weight Tracker - Main JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const weightChartCanvas = document.getElementById('weightChart');
    const addDataBtn = document.getElementById('addDataBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const inputModal = document.getElementById('inputModal');
    const closeModalBtn = document.querySelector('.close');
    const cancelBtn = document.getElementById('cancelBtn');
    const weightForm = document.getElementById('weightForm');
    const weightInput = document.getElementById('weight');
    const timeInput = document.getElementById('time');
    const recentReadingsContainer = document.getElementById('recentReadings');
    const chartLoading = document.getElementById('chartLoading');
    
    // Chart instance
    let weightChart = null;
    
    // Weight data array
    let weightData = [];
    
    // Initialize - bind events immediately for responsiveness
    init();
    
    // Function to initialize the application
    function init() {
        // Bind event listeners FIRST for immediate responsiveness
        addDataBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        exportDataBtn.addEventListener('click', exportDataToCSV);
        clearDataBtn.addEventListener('click', clearAllData);
        weightForm.addEventListener('submit', handleFormSubmit);
        
        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            if (event.target === inputModal) {
                closeModal();
            }
        });
        
        // Load data and initialize chart (may be delayed)
        loadDataFromStorage();
        renderRecentReadings();
        setCurrentDateTime();
        
        // Initialize chart with retry logic
        initChartWithRetry();
    }
    
    // Initialize chart with retry logic for Chart.js loading
    function initChartWithRetry(retryCount = 0) {
        const maxRetries = 10;
        
        if (typeof Chart === 'undefined') {
            if (retryCount < maxRetries) {
                // Chart.js not loaded yet, retry after 300ms
                setTimeout(() => {
                    initChartWithRetry(retryCount + 1);
                }, 300);
                
                // Show loading message
                if (chartLoading) {
                    chartLoading.innerHTML = `
                        <div class="loading-spinner"></div>
                        <p>加载图表库中... (${retryCount + 1}/${maxRetries})</p>
                    `;
                }
            } else {
                // Max retries reached, show error
                hideChartLoading();
                showNotification('加载图表库失败。请检查本地文件 lib/chart.min.js 是否存在。', 'error');
                console.error('Chart.js failed to load after', maxRetries, 'retries');
            }
            return;
        }
        
        // Chart.js is loaded, proceed with initialization
        initChart();
    }
    
    // Hide chart loading overlay
    function hideChartLoading() {
        if (chartLoading) {
            chartLoading.style.display = 'none';
        }
    }
    
    // Load data from localStorage
    function loadDataFromStorage() {
        const storedData = localStorage.getItem('weightData');
        if (storedData) {
            weightData = JSON.parse(storedData);
            // Sort by date (oldest first)
            weightData.sort((a, b) => new Date(a.time) - new Date(b.time));
            // Compress data by day (remove extremes and average)
            compressDataByDay();
        }
    }
    
    // Compress data by day: for each day, if more than 2 readings, remove max and min, average the rest
    function compressDataByDay() {
        if (weightData.length === 0) return;
        
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Group by date (ignoring time) using local date, exclude today's data
        const groups = {};
        const todayReadings = [];
        weightData.forEach(reading => {
            const date = new Date(reading.time);
            // Use local date string YYYY-MM-DD
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            if (dateStr === todayStr) {
                // Today's data: keep as is, no compression
                todayReadings.push(reading);
            } else {
                if (!groups[dateStr]) {
                    groups[dateStr] = [];
                }
                groups[dateStr].push(reading);
            }
        });
        
        // Process each group (only past days)
        const compressedData = [];
        Object.keys(groups).sort().forEach(dateStr => {
            const group = groups[dateStr];
            if (group.length === 1) {
                // Keep the single reading
                compressedData.push(group[0]);
            } else if (group.length === 2) {
                // Average the two readings
                const avgWeight = Math.round((group[0].weight + group[1].weight) * 10) / 10; // keep one decimal
                // Average time (milliseconds)
                const avgTime = new Date((new Date(group[0].time).getTime() + new Date(group[1].time).getTime()) / 2);
                const newReading = {
                    weight: avgWeight,
                    time: formatDateTimeLocal(avgTime)
                };
                compressedData.push(newReading);
            } else {
                // More than 2 readings: remove max and min weight readings
                // Find indices of max and min weight
                let maxIdx = 0, minIdx = 0;
                for (let i = 1; i < group.length; i++) {
                    if (group[i].weight > group[maxIdx].weight) maxIdx = i;
                    if (group[i].weight < group[minIdx].weight) minIdx = i;
                }
                // If maxIdx and minIdx are the same (all weight equal), remove only one reading
                // Create a new array without max and min (if same, only one is removed)
                const remaining = group.filter((_, idx) => idx !== maxIdx && idx !== minIdx);
                // Calculate averages
                let sumWeight = 0, sumTime = 0;
                remaining.forEach(reading => {
                    sumWeight += reading.weight;
                    sumTime += new Date(reading.time).getTime();
                });
                const avgWeight = Math.round((sumWeight / remaining.length) * 10) / 10;
                const avgTime = new Date(sumTime / remaining.length);
                const newReading = {
                    weight: avgWeight,
                    time: formatDateTimeLocal(avgTime)
                };
                compressedData.push(newReading);
            }
        });
        
        // Combine compressed data with today's readings (keep today's data unchanged)
        const combinedData = compressedData.concat(todayReadings);
        // Sort by date (oldest first)
        combinedData.sort((a, b) => new Date(a.time) - new Date(b.time));
        
        // Replace weightData with combined data
        weightData = combinedData;
        // Save compressed data to localStorage
        saveDataToStorage();
    }
    
    // Helper: format Date object to datetime-local string (YYYY-MM-DDTHH:mm)
    function formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    // Save data to localStorage
    function saveDataToStorage() {
        localStorage.setItem('weightData', JSON.stringify(weightData));
    }
    
    // Initialize the chart
    function initChart() {
        if (weightChart) {
            weightChart.destroy();
        }
        
        const ctx = weightChartCanvas.getContext('2d');
        
        // Prepare chart data - show only the 10 most recent readings
        const recentData = weightData.slice(-10);
        const labels = recentData.map(item => formatTimeForChart(item.time));
        const weightDataPoints = recentData.map(item => item.weight);
        
        weightChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '体重',
                        data: weightDataPoints,
                        borderColor: '#9b59b6',
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#9b59b6',
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 14,
                                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                            },
                            padding: 20
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += context.parsed.y + ' kg';
                                return label;
                            },
                            title: function(context) {
                                const index = context[0].dataIndex;
                                return formatTimeForTooltip(recentData[index].time);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: '时间',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        reverse: false
                    },
                    y: {
                        title: {
                            display: true,
                            text: '体重（kg）',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        min: 20,
                        max: 200,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            }
        });
        
        // Hide loading overlay after chart is initialized
        hideChartLoading();
    }
    
    // Render recent readings in the sidebar
    function renderRecentReadings() {
        // Get today's date string (YYYY-MM-DD)
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Filter today's readings
        const todayReadings = weightData.filter(reading => {
            const date = new Date(reading.time);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return dateStr === todayStr;
        });
        
        if (todayReadings.length === 0) {
            recentReadingsContainer.innerHTML = '<p class="empty-message">今日暂无数据。添加今日的第一个读数！</p>';
            return;
        }
        
        // Show today's readings (newest first)
        const recentData = todayReadings.reverse();
        
        let html = '';
        recentData.forEach((reading, index) => {
            const weightClass = reading.weight >= 90 ? 'weight-high' : ''; // 90 kg 作为超重阈值
            const readingClass = weightClass.trim();
            
            // Find actual index in weightData
            const actualIndex = weightData.findIndex(item => item === reading);
            
            html += `
                <div class="reading-item ${readingClass}">
                    <div class="reading-info">
                        <div class="reading-value">
                            ${reading.weight} <span>kg</span>
                        </div>
                        <div class="reading-time">
                            ${formatTimeForDisplay(reading.time)}
                        </div>
                    </div>
                    <div class="reading-actions">
                        <button class="delete-reading" data-index="${actualIndex}">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        });
        
        recentReadingsContainer.innerHTML = html;
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-reading').forEach(button => {
            button.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                deleteReading(index);
            });
        });
    }
    
    // Delete a specific reading
    function deleteReading(index) {
        if (confirm('您确定要删除这个读数吗？')) {
            // Index is already the actual index in weightData
            if (index >= 0 && index < weightData.length) {
                weightData.splice(index, 1);
                saveDataToStorage();
                initChart();
                renderRecentReadings();
            }
        }
    }
    
    // Open the input modal
    function openModal() {
        setCurrentDateTime();
        inputModal.style.display = 'flex';
        weightInput.focus();
    }
    
    // Close the input modal
    function closeModal() {
        inputModal.style.display = 'none';
        weightForm.reset();
        setCurrentDateTime();
    }
    
    // Set current date and time in the time input
    function setCurrentDateTime() {
        const now = new Date();
        // Format to YYYY-MM-DDTHH:mm (datetime-local format)
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        timeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    // Handle form submission
    function handleFormSubmit(event) {
        event.preventDefault();
        
        const weight = parseFloat(weightInput.value);
        const time = timeInput.value;
        
        // Basic validation
        if (weight < 20 || weight > 200) {
            alert('请输入有效的体重值（20-200 kg）。');
            return;
        }
        
        // Create new reading object
        const newReading = {
            weight: weight,
            time: time
        };
        
        // Add to data array (oldest first)
        weightData.push(newReading);
        // Sort by date (oldest first)
        weightData.sort((a, b) => new Date(a.time) - new Date(b.time));
        
        // Save to localStorage
        saveDataToStorage();
        
        // Update chart
        initChart();
        
        // Update recent readings
        renderRecentReadings();
        
        // Close modal and reset form
        closeModal();
        
        // Show success message
        showNotification('读数添加成功！', 'success');
    }
    
    // Clear all data
    function clearAllData() {
        if (weightData.length === 0) {
            alert('没有数据可清除。');
            return;
        }
        
        if (confirm('您确定要删除所有体重读数吗？此操作无法撤销。')) {
            weightData = [];
            localStorage.removeItem('weightData');
            initChart();
            renderRecentReadings();
            showNotification('所有数据已清除。', 'info');
        }
    }
    
    // Show notification
    function showNotification(message, type) {
        // Remove existing notification
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-width: 300px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        
        if (type === 'success') {
            notification.style.background = 'linear-gradient(to right, #2ecc71, #27ae60)';
        } else if (type === 'info') {
            notification.style.background = 'linear-gradient(to right, #3498db, #2980b9)';
        } else {
            notification.style.background = 'linear-gradient(to right, #e74c3c, #c0392b)';
        }
        
        // Add close button event
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        document.body.appendChild(notification);
        
        // Add animation keyframes
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    margin-left: 15px;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Format time for chart labels
    function formatTimeForChart(timeString) {
        const date = new Date(timeString);
        return date.toLocaleDateString('zh-CN', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Format time for tooltip
    function formatTimeForTooltip(timeString) {
        const date = new Date(timeString);
        return date.toLocaleString('zh-CN', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Format time for display in recent readings
    function formatTimeForDisplay(timeString) {
        const date = new Date(timeString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 60) {
            return `${diffMins} 分钟前`;
        } else if (diffHours < 24) {
            return `${diffHours} 小时前`;
        } else if (diffDays < 7) {
            return `${diffDays} 天前`;
        } else {
            return date.toLocaleDateString('zh-CN', { 
                year: 'numeric',
                month: 'short', 
                day: 'numeric'
            });
        }
    }

    // Export data to CSV file
    function exportDataToCSV() {
        if (weightData.length === 0) {
            alert('没有数据可导出。');
            return;
        }

        // CSV header
        const header = ['时间', '体重 (kg)'];
        // CSV rows
        const rows = weightData.map(reading => {
            // Format time for CSV (keep original datetime-local format)
            const time = reading.time.replace('T', ' ');
            return `"${time}",${reading.weight}`;
        });

        // Combine header and rows
        const csvContent = [header.join(','), ...rows].join('\n');

        // Create Blob
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });

        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `体重数据_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Show success notification
        showNotification('数据导出成功！', 'success');
    }
});
