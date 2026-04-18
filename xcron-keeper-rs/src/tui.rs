use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::Span,
    widgets::{Block, Borders, Paragraph},
    Terminal,
};
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::{
    io,
    sync::{Arc, atomic::{AtomicU64, Ordering}},
    time::{Duration, Instant},
};

pub struct AppStats {
    pub total_tx_sent: AtomicU64,
    pub total_errors: AtomicU64,
    pub current_tps: AtomicU64,
    pub active_workers: AtomicU64,
}

impl AppStats {
    pub fn new() -> Self {
        Self {
            total_tx_sent: AtomicU64::new(0),
            total_errors: AtomicU64::new(0),
            current_tps: AtomicU64::new(0),
            active_workers: AtomicU64::new(0),
        }
    }
}

pub async fn run_dashboard(stats: Arc<AppStats>) -> Result<(), Box<dyn std::error::Error>> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut last_tick = Instant::now();
    let tick_rate = Duration::from_millis(250);
    
    let mut last_tx_count = 0;

    loop {
        // Calculate TPS
        let now = Instant::now();
        if now.duration_since(last_tick) >= Duration::from_secs(1) {
            let current_total = stats.total_tx_sent.load(Ordering::Relaxed);
            let tps = current_total.saturating_sub(last_tx_count);
            stats.current_tps.store(tps, Ordering::Relaxed);
            last_tx_count = current_total;
            last_tick = now;
        }

        terminal.draw(|f| {
            let size = f.area();
            
            // UI Layout
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(2)
                .constraints(
                    [
                        Constraint::Length(3),
                        Constraint::Min(5),
                    ]
                    .as_ref(),
                )
                .split(size);

            // Header block (The Eye of Sauron)
            let header = Paragraph::new(Span::styled(
                "👁️  THE EYE OF SAURON - XCRON KEEPER COMMAND CENTER 👁️",
                Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            ))
            .alignment(ratatui::layout::Alignment::Center)
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::Red)));
            
            f.render_widget(header, chunks[0]);

            // Stats Block
            let tps = stats.current_tps.load(Ordering::Relaxed);
            let total = stats.total_tx_sent.load(Ordering::Relaxed);
            let errors = stats.total_errors.load(Ordering::Relaxed);
            let workers = stats.active_workers.load(Ordering::Relaxed);

            let stats_text = vec![
                ratatui::text::Line::from(vec![
                    Span::raw("🔥 Active Rust Threads (Sub-Keepers): "),
                    Span::styled(format!("{}", workers), Style::default().fg(Color::Yellow)),
                ]),
                ratatui::text::Line::from(""),
                ratatui::text::Line::from(vec![
                    Span::raw("⚡️ Operations Per Second (TPS):     "),
                    Span::styled(format!("{}", tps), Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                ]),
                ratatui::text::Line::from(""),
                ratatui::text::Line::from(vec![
                    Span::raw("🚀 Total Payloads Delivered:       "),
                    Span::styled(format!("{}", total), Style::default().fg(Color::Cyan)),
                ]),
                ratatui::text::Line::from(""),
                ratatui::text::Line::from(vec![
                    Span::raw("❌ Network Errors / Blocks:        "),
                    Span::styled(format!("{}", errors), Style::default().fg(Color::Red)),
                ]),
                ratatui::text::Line::from(""),
                ratatui::text::Line::from(Span::styled("Press 'q' to abort mission and terminate attack.", Style::default().fg(Color::DarkGray))),
            ];

            let dashboard = Paragraph::new(stats_text)
                .block(Block::default().title(" LIVE RADAR ").borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
            
            f.render_widget(dashboard, chunks[1]);
        })?;

        // Handle Input
        if crossterm::event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if let KeyCode::Char('q') = key.code {
                    break;
                }
            }
        }
    }

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen
    )?;
    terminal.show_cursor()?;

    Ok(())
}
