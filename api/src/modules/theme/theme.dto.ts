import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * Organisation theme. The design tokens are stored verbatim as an app setting,
 * so the DTO validates the shape (id + three colours) rather than the palette:
 * the brand rules live in the design system, not here.
 */

export const THEME_IDS = ['honey', 'sky', 'rose', 'mint', 'violet', 'stone'] as const;

export class ThemeTokensDto {
  @IsIn(THEME_IDS as unknown as string[], { message: 'Unknown theme' })
  id!: string;

  @IsString()
  @MaxLength(40)
  bg!: string;

  @IsString()
  @MaxLength(40)
  accent!: string;

  @IsString()
  @MaxLength(40)
  txt!: string;

  /** Optional extra slots the UI may add later; kept loose on purpose. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  muted?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  surface?: string;
}

export class SetDefaultThemeDto {
  @Type(() => ThemeTokensDto)
  @ValidateNested()
  theme!: ThemeTokensDto;
}
