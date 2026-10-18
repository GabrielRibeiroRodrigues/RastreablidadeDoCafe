import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, type Role as AppRole } from '@traceflow/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { trim } from '../../common/http/transforms.js';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class InviteUserDto {
  @ApiProperty({ example: 'bruno@serraazul.com.br' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Bruno Costa' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ROLES, enumName: 'AppRole', example: 'operator' })
  @IsIn(ROLES)
  role!: AppRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Bruno Costa' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ROLES, enumName: 'AppRole' })
  @IsOptional()
  @IsIn(ROLES)
  role?: AppRole;
}

const USER_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: USER_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort: UserSort = 'name';

  @ApiPropertyOptional({ description: 'Busca por nome ou e-mail' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ROLES, enumName: 'AppRole' })
  @IsOptional()
  @IsIn(ROLES)
  role?: AppRole;
}

export class UserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'bruno@serraazul.com.br' }) email!: string;
  @ApiProperty({ example: 'Bruno Costa' }) name!: string;
  @ApiProperty({ enum: ROLES, enumName: 'AppRole' }) role!: AppRole;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'É o próprio usuário logado' }) isCurrentUser!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
