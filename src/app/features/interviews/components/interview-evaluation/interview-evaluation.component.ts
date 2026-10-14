import { AfterViewInit, Component, OnInit, ViewChildren, ElementRef, QueryList } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { AccordionModule } from 'primeng/accordion';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { InterviewEvaluationService } from '../../../../core/services/interview-evaluation.service';
import { NotificationService } from '../../../../core/services/utils/notification.service';
import { LanguageService } from '../../../../core/services/language.service';

import { Evaluation } from '../../../../core/models/evaluation';
import { InterviewEvaluationDisplay } from '../../../../core/models/interview-evaluation-display';
import { InterviewInstance } from '../../../../core/models/interview-instance';

@Component({
    selector: 'app-interview-evaluation',
    standalone: true,
    imports: [
        ProgressSpinnerModule,
        MessageModule,
        CommonModule,
        CardModule,
        ButtonModule,
        BadgeModule,
        TagModule,
        AccordionModule,
        ToastModule,
        TooltipModule,
        TranslateModule
    ],
    providers: [MessageService, NotificationService],
    templateUrl: './interview-evaluation.component.html',
    styleUrls: ['./interview-evaluation.component.scss']
})
export class InterviewEvaluationComponent implements OnInit, AfterViewInit {
    @ViewChildren('scoreCircle') scoreCircles!: QueryList<ElementRef>;

    interview: InterviewInstance | null = null;
    interviewEvaluation?: InterviewEvaluationDisplay;
    evaluations: Evaluation[] = [];

    loading = true;
    error = { happened: false, message: '' };
    animatedScores: Record<string, number> = {};

    overallEvaluation?: Evaluation;

    transcription: string[] = [];

    showTranscript = true;

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private evaluationService: InterviewEvaluationService,
        private messageService: MessageService,
        private notify: NotificationService,
        private translate: TranslateService,
        private languageService: LanguageService
    ) { }

    ngOnInit(): void {
        // Set up language subscription
        this.languageService.getLanguageObservable().subscribe(lang => {
            this.translate.use(lang);
        });

        this.interview = history.state?.interview ?? null;

        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            this.loading = false;
            this.error = {
                happened: true,
                message: this.translate.instant('evaluation.errors.missingInterviewId')
            };
            return;
        }

        if (!this.interview) {
            const stored = sessionStorage.getItem(`interview_${id}`);
            if (stored) {
                try {
                    this.interview = JSON.parse(stored);
                } catch { }
            }
        }

        this.loadEvaluations(id);
        this.evaluationService.getInterviewTranscription(id).subscribe({
            next: (transcriptionRaw: any) => {
                try {
                    if (typeof transcriptionRaw === 'string') {
                        try {
                            const parsed = JSON.parse(transcriptionRaw);
                            if (typeof parsed === 'object' && parsed !== null && parsed.transcription) {
                                const inner = JSON.parse(parsed.transcription);
                                this.transcription = Array.isArray(inner) ? inner : [inner];
                            } else if (Array.isArray(parsed)) {
                                this.transcription = parsed;
                            } else {
                                this.transcription = [transcriptionRaw];
                            }
                        } catch (e) {
                            // If it fails to parse, it might be a plain string
                            this.transcription = [transcriptionRaw];
                        }
                    } else if (Array.isArray(transcriptionRaw)) {
                        this.transcription = transcriptionRaw;
                    } else if (transcriptionRaw && typeof transcriptionRaw === 'object') {
                        if (transcriptionRaw.transcription) {
                            try {
                                const inner = JSON.parse(transcriptionRaw.transcription);
                                this.transcription = Array.isArray(inner) ? inner : [inner];
                            } catch (e) {
                                this.transcription = [transcriptionRaw.transcription];
                            }
                        } else {
                            this.transcription = [];
                        }
                    }
                    console.log('Transcription loaded, entries:', this.transcription.length);
                } catch (e) {
                    console.error('Failed to parse transcription JSON', e);
                    this.transcription = [];
                }
            },
            error: (err) => console.error('Failed to load transcription', err)
        });
    }

    ngAfterViewInit(): void {
        if (this.evaluations.length > 0) setTimeout(() => this.animateAllScores(), 100);
    }

    private loadEvaluations(interviewId: string): void {
        this.evaluationService.getInterviewEvaluations(interviewId).subscribe({
            next: (data: InterviewEvaluationDisplay) => {
                this.interviewEvaluation = data;
                this.evaluations = data.evaluations ?? [];
                this.evaluations.forEach((e) => (this.animatedScores[e.id] = 0));

                // Search for 'OverAll' evaluation type (case-insensitive)
                this.overallEvaluation = this.evaluations.find(
                    e => e.evaluationType?.description?.toLowerCase() === 'overall'
                );

                // If no dedicated OverAll entry, compute it as a weighted average
                if (!this.overallEvaluation) {
                    const scored = this.evaluations.filter(e => e.score != null && e.evaluationType?.coefficient);
                    if (scored.length > 0) {
                        const totalWeight = scored.reduce((s, e) => s + (e.evaluationType.coefficient || 1), 0);
                        const weightedSum = scored.reduce((s, e) => s + (e.score! * (e.evaluationType.coefficient || 1)), 0);
                        const computedScore = Math.round(weightedSum / totalWeight);
                        // Build a synthetic evaluation entry for display
                        this.overallEvaluation = {
                            id: 'overall-computed',
                            score: computedScore,
                            feedback: '',
                            interviewID: '',
                            evaluationType: { id: '', description: 'OverAll', coefficient: 0 }
                        };
                        this.animatedScores['overall-computed'] = 0;
                    }
                }

                // Debug log
                console.log('Evaluations loaded:', this.evaluations);
                console.log('Overall evaluation:', this.overallEvaluation);
                this.loading = false;
                setTimeout(() => this.animateAllScores(), 100);
            },
            error: (err) => {
                console.error('Failed to fetch evaluation:', err);
                this.notify.showError(
                    this.translate.instant('evaluation.errors.title'),
                    this.translate.instant('evaluation.errors.loadFailed')
                );
                this.loading = false;
                this.error = {
                    happened: true,
                    message: this.translate.instant('evaluation.errors.loadFailed')
                };
            }
        });
    }

    private toDate(v: unknown): Date | null {
        if (v == null) return null;
        const d = new Date(v as any);
        return isNaN(d.getTime()) ? null : d;
    }

    getProgressDegrees(score: number): string {
        const degrees = (score / 100) * 360;
        return degrees + 'deg';
    }

    getRealDurationLabel(): string {
        const start = this.toDate(this.interview?.startTime) ?? this.toDate(this.interview?.scheduledAt);
        const end = this.toDate(this.interview?.endTime);
        if (!start || !end) return '—';

        const diffMs = end.getTime() - start.getTime();
        if (diffMs <= 0) return '—';

        const minutes = Math.round(diffMs / 60000);
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m} min`;
    }

    getScoreRangeClass(score: number): string {
        if (score >= 75) return 'score-75-100';
        if (score >= 50) return 'score-50-75';
        if (score >= 25) return 'score-25-50';
        return 'score-0-25';
    }

    getScoreColor(score: number): string {
        if (score >= 75) return 'var(--primary-color)';
        if (score >= 50) return '#eab308';
        if (score >= 25) return '#f97316';
        return '#ef4444';
    }

    getScoreTextClass(score: number): string {
        if (score >= 75) return 'score-excellent';
        if (score >= 50) return 'score-good';
        if (score >= 25) return 'score-average';
        return 'score-poor';
    }

    animateAllScores(): void {
        if (!this.scoreCircles) return;
        const els = this.scoreCircles.toArray();
        let elIndex = 0;

        // Animate overall if present
        if (this.overallEvaluation && els[elIndex]) {
            this.animateScore(els[elIndex].nativeElement, this.overallEvaluation);
            elIndex++;
        }

        // Animate non-overall evaluations
        this.nonOverallEvaluations.forEach((evaluation) => {
            if (els[elIndex]) {
                this.animateScore(els[elIndex].nativeElement, evaluation);
                elIndex++;
            }
        });
    }

    animateScore(scoreElement: HTMLElement, evaluation: Evaluation): void {
        if (!scoreElement || evaluation.score == null) return;
        const finalScore = evaluation.score;
        this.animateScoreNumber(evaluation.id, finalScore);
        setTimeout(() => scoreElement.classList.add('pulse'), 2000);
    }

    animateScoreNumber(evaluationId: string, targetScore: number): void {
        const duration = 2000;
        const startTime = performance.now();
        const step = (t: number) => {
            const p = Math.min((t - startTime) / duration, 1);
            const e = p < 0.5 ? 4 * p * p * p : (p - 1) * (2 * p - 2) * (2 * p - 2) + 1;
            this.animatedScores[evaluationId] = Math.round(e * targetScore);
            if (p < 1) requestAnimationFrame(step);
            else this.animatedScores[evaluationId] = targetScore;
        };
        requestAnimationFrame(step);
    }

    triggerScoreAnimation(): void {
        if (!this.scoreCircles || !this.evaluations.length) return;
        const els = this.scoreCircles.toArray();
        els.forEach((el) => el.nativeElement.classList.remove('animate', 'pulse'));
        
        if (this.overallEvaluation) this.animatedScores[this.overallEvaluation.id] = 0;
        this.evaluations.forEach((e) => (this.animatedScores[e.id] = 0));
        setTimeout(() => this.animateAllScores(), 100);
    }

    getEvaluationTypeDescription(e: Evaluation): string {
        return e.evaluationType?.description || this.translate.instant('evaluation.generalEvaluation');
    }

    getAnimatedScore(id: string): number {
        return Math.round(this.animatedScores[id]) || 0;
    }

    trackByEvaluationId(_: number, e: Evaluation): string {
        return e.id;
    }

    get nonOverallEvaluations() {
        return this.evaluations.filter(e => this.getEvaluationTypeDescription(e) !== 'OverAll');
    }

    getTranscriptEntries(): Array<{speaker: string, time: string, message: string, type: 'interviewer' | 'candidate'}> {
        const entries: Array<{speaker: string, time: string, message: string, type: 'interviewer' | 'candidate'}> = [];

        // Matches: "SpeakerLabel - HH:MM:SS : rest of message"
        // Group 1: speaker label (AI or Candidate)
        // Group 2: timestamp HH:MM:SS
        // Group 3: message (everything after the first ": " following the timestamp)
        const lineRegex = /^(.+?)\s*-\s*(\d{2}:\d{2}:\d{2})\s*:\s*([\s\S]+)$/;

        this.transcription.forEach(entry => {
            const parts = entry.split('||');

            // Parse AI/Interviewer part (Question)
            if (parts[0]) {
                const aiPart = parts[0].trim();
                const match = lineRegex.exec(aiPart);
                if (match) {
                    entries.push({
                        speaker: this.translate.instant('evaluation.interviewer'),
                        time: match[2],
                        message: match[3].trim(),
                        type: 'interviewer'
                    });
                }
            }

            // Parse Candidate part (Answer)
            if (parts[1]) {
                const candidatePart = parts[1].trim();
                const match = lineRegex.exec(candidatePart);
                const candidateName = this.interviewEvaluation?.candidateFullName || this.translate.instant('evaluation.candidate');
                if (match) {
                    entries.push({
                        speaker: candidateName,
                        time: match[2],
                        message: match[3].trim(),
                        type: 'candidate'
                    });
                }
            }
        });

        return entries;
    }
}
