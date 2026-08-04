# Sedinho — Specifica funzionale v1.0

## 1. Visione

Sedinho è un'applicazione web personale progettata per assistere un singolo fantallenatore durante tutte le fasi della stagione.

Il sistema integra:

* raccolta automatica dei dati;
* elaborazione statistica;
* modelli previsionali;
* simulazione;
* supporto decisionale in tempo reale;
* analisi grafica avanzata.

L'obiettivo non è individuare "il giocatore migliore", ma identificare **la scelta con il miglior valore atteso nel preciso istante in cui deve essere presa**.

---

## 2. Principi progettuali

L'intero sistema dovrà rispettare alcuni principi.

### Configurabile

Ogni lega ha regole differenti.

Sedinho non conterrà regole predefinite.

Il primo avvio guiderà l'utente nella configurazione completa della lega.

Ogni algoritmo utilizzerà tali parametri.

### Spiegabile

Ogni suggerimento dovrà essere motivato.

Non esisteranno decisioni "black box".

Ogni valutazione mostrerà:

* fattori favorevoli
* fattori contrari
* peso di ogni fattore
* livello di affidabilità

### Aggiornamento manuale

L'app non eseguirà scraping automatico.

L'utente aggiornerà il database quando desidera.

Questo evita traffico inutile, riduce il rischio di blocchi e rende prevedibile lo stato dei dati.

### Modularità

Ogni componente dovrà poter essere sostituito senza modificare gli altri.

---

## 3. Primo avvio

Al primo utilizzo Sedinho avvierà un Setup Wizard.

### Configurazione della lega

#### Struttura

* nome lega
* numero partecipanti
* budget iniziale
* composizione della rosa
* moduli consentiti
* modalità asta
* ordine di chiamata

#### Regolamento

L'utente fornirà il regolamento completo.

Sedinho lo analizzerà e costruirà automaticamente:

* bonus
* malus
* modificatori
* regole di formazione
* regole di mercato
* eventuali eccezioni

Il regolamento diventerà parte integrante del modello matematico.

---

## 4. Database centrale

Ogni giocatore possiederà un profilo estremamente dettagliato.

### Dati anagrafici

* nome
* squadra
* ruolo
* età
* nazionalità
* piede

### Storico

Per ogni stagione:

* presenze
* minuti
* fantamedia
* media voto
* gol
* assist
* xG
* xA
* tiri
* tiri nello specchio
* ammonizioni
* espulsioni
* rigori
* clean sheet
* expected bonus

### Stato

* disponibile
* infortunato
* squalificato
* recupero stimato

### Gerarchie

* titolare
* prima alternativa
* seconda alternativa

con livello di affidabilità.

### Calci piazzati

* primo rigorista
* secondo rigorista
* terzo rigorista
* primo tiratore punizioni dirette
* secondo tiratore
* corner
* punizioni laterali

Ogni ruolo sarà associato ad una probabilità reale di utilizzo.

### Rotazioni

Per ogni squadra verranno stimati:

* numero competizioni
* frequenza turnover
* affidabilità dell'allenatore
* probabilità di turnover per ruolo

---

## 5. Sistema di aggiornamento

Un solo pulsante: `Aggiorna Database`.

Aggiornerà:

* trasferimenti
* statistiche
* probabili formazioni
* infortuni
* squalifiche
* quotazioni
* gerarchie
* rigoristi
* tiratori di punizioni
* calendari
* competizioni europee

Ogni dato verrà salvato con:

* fonte
* data aggiornamento
* livello di affidabilità

---

## 6. Transfer Engine

Memorizza ogni trasferimento.

Per ciascun movimento calcola automaticamente:

* impatto sulla titolarità
* impatto sul minutaggio
* impatto sui bonus
* variazione di rischio
* variazione del valore fantacalcistico

Vengono evidenziati automaticamente tutti i nuovi acquisti con probabilità di titolarità superiore al 55%.

---

## 7. Rotation Engine

Uno dei moduli distintivi del progetto.

Tiene conto di:

* Champions League
* Europa League
* Conference League
* Coppa Italia

Introduce un coefficiente di rotazione che modifica il valore di:

* titolari
* prime riserve
* seconde linee

L'obiettivo è rappresentare casi come: "il dodicesimo uomo dell'Inter gioca statisticamente più minuti del dodicesimo uomo del Sassuolo".

---

## 8. Player Evaluation Engine

Ogni giocatore riceve decine di indicatori.

### Affidabilità

* Starter Probability
* Reliability Score
* Injury Risk
* Rotation Risk

### Produzione

* Expected Goals
* Expected Assists
* Expected Minutes
* Expected Fantasy Points

### Bonus

* Penalty Potential
* Free Kick Potential
* Clean Sheet Potential
* Assist Potential

### Stabilità

* Floor Score
* Ceiling Score
* Consistency Index
* Volatility Index

### Convenienza

* Value Score
* Expected Auction Price
* Efficiency Index
* Opportunity Score

Ogni indice sarà documentato e verificabile.

---

## 9. Dashboard

La dashboard dovrà essere completamente interattiva.

Ogni pannello sarà filtrabile per: ruolo, squadra, fascia prezzo, età, rischio, titolarità.

### Sezioni

* migliori occasioni
* giocatori sopravvalutati
* nuovi titolari
* nuovi rigoristi
* cambi di gerarchia
* infortuni
* trasferimenti
* giocatori in crescita
* giocatori in calo

---

## 10. Sistema grafico

Ogni tabella potrà essere trasformata in grafico.

Saranno disponibili: barre, linee, radar, dispersione, istogrammi, box plot, heatmap, distribuzioni, timeline.

### Grafici sovrapponibili

Funzionalità fondamentale. L'utente potrà selezionare due o più giocatori e confrontarli direttamente sullo stesso grafico (fantamedia, minuti, gol/assist, prezzo stimato vs reale, rischio vs rendimento, valore atteso vs costo previsto).

Sarà inoltre possibile confrontare: giocatore vs media del ruolo, giocatore vs media della squadra, due squadre, due ruoli, andamento del mercato rispetto alle previsioni.

Ogni grafico sarà esportabile.

---

## 11. Live Auction Engine

Durante l'asta sarà sufficiente inserire: giocatore, prezzo, acquirente.

Ogni inserimento aggiornerà immediatamente: budget residui, fabbisogni di ruolo, valore del mercato, probabilità residue, migliori opportunità.

---

## 12. Profilazione degli avversari

Sedinho costruirà automaticamente il profilo di ogni partecipante.

Indicatori: aggressività nei rilanci, spesa media, preferenza per top player, preferenza per giovani, preferenza per determinate squadre, concentrazione della spesa, capacità residua di rilancio, overpay index.

Il profilo verrà aggiornato in tempo reale.

---

## 13. Market Engine

Analizza continuamente il comportamento dell'asta.

Calcola: inflazione dei prezzi, svalutazione dei ruoli, temperatura del mercato, disponibilità residua, scarsità dei titolari, valore medio dei rilanci.

Ogni parametro modifica automaticamente le valutazioni.

---

## 14. Decision Engine

È il cuore del progetto. Risponde a domande operative come:

* Conviene rilanciare?
* Qual è il prezzo massimo corretto?
* Conviene attendere?
* Quale giocatore offre il miglior rapporto qualità/prezzo?
* Chi dovrei chiamare adesso?
* Quanto vale realmente questo rilancio?
* Conviene completare una coppia?
* Quanto rischio introduco nella mia rosa acquistando questo giocatore?

Ogni risposta sarà accompagnata da una spiegazione dettagliata e da un livello di confidenza.

---

## 15. Simulatore

Prima dell'asta Sedinho potrà simulare migliaia di aste utilizzando: distribuzioni di prezzo, comportamento storico dei partecipanti, regole della lega, budget disponibili.

Il simulatore produrrà: intervalli di prezzo, probabilità di aggiudicazione, strategie alternative, analisi di sensibilità.

---

## 16. Report finale

Al termine dell'asta Sedinho produrrà automaticamente un report completo.

Indicatori: valore teorico della rosa, punti attesi, distribuzione del rischio, equilibrio tra reparti, dipendenza da una singola squadra, copertura dei rigoristi, copertura dei piazzati, esposizione al turnover, confronto tra costo pagato e valore stimato, analisi delle migliori e peggiori operazioni.

---

## 17. Tecnologie proposte (da valutare)

* **Frontend:** React + TypeScript
* **Backend:** Node.js
* **Database:** SQLite (locale) con possibilità di migrazione futura a PostgreSQL
* **Scraping:** Playwright + Cheerio
* **Motore statistico:** TypeScript
* **Grafici:** Recharts
* **Deploy:** Vercel (frontend) + backend locale o serverless

---

## Obiettivo finale

Sedinho non dovrà essere percepito come un semplice "tool per il fantacalcio", ma come una piattaforma di analisi che integra statistica, modellazione, visualizzazione e supporto decisionale. L'utente deve poter passare da una panoramica generale fino al dettaglio di un singolo giocatore, confrontare qualsiasi metrica con grafici sovrapponibili e ricevere suggerimenti contestualizzati, motivati e coerenti con il regolamento della propria lega e con l'evoluzione dell'asta.
