import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { ScoresModule } from './modules/scores/scores.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { BackupModule } from './modules/backup/backup.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { AiModule } from './modules/ai/ai.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { RecycleModule } from './modules/recycle/recycle.module';
import { GlobalAuthGuard } from './common/global-auth.guard';

/** 应用根模块 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    StudentsModule,
    ScoresModule,
    IncidentsModule,
    BackupModule,
    DashboardModule,
    AnalysisModule,
    AiModule,
    CommentsModule,
    SettingsModule,
    KnowledgeModule,
    RecycleModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard,
    },
  ],
})
export class AppModule {}
