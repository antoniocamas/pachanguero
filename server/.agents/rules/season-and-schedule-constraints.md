CODENAME: DC-SEASON-SCHEDULE-328

# Seasons and the weekly schedule

- Derive the season, never pick it: it runs 1 Sept–31 Aug and follows from its name (`SeasonCalendar`); a game's season is the one containing its date. Never add an active-season flag or a per-season sign-up step; a `season_players` row appears on first appearance.
- Keep the rules per season (columns on `seasons`, editable from Ajustes); never rewrite history when a rule changes.
- Create weekly schedule rows, never edit them, so earlier weeks keep resolving as they did.
