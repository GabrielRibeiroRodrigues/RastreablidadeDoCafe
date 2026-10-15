import type { Control, FieldValues, Path } from 'react-hook-form';
import { SelectField, TextareaField, TextField } from '@/components/form/fields';
import { ROAST_LEVEL_LABELS } from '@/features/products/labels';
import { toOptions } from '@/lib/options';
import type { QUALITY_FIELDS } from './quality';
import { maskDecimal, maskInteger } from '@/lib/masks';

const maskDecimal2 = (value: string) => maskDecimal(value, 2);

/** Campos de qualidade (sem a validade, que cada tela posiciona). */
export function QualityFields<T extends FieldValues, C, O extends FieldValues>({
  control,
}: {
  control: Control<T, C, O>;
}) {
  const name = (field: (typeof QUALITY_FIELDS)[number]) => field as Path<T>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TextField control={control} name={name('harvest')} label="Safra" placeholder="2025/26" />
      <TextField
        control={control}
        name={name('variety')}
        label="Variedade"
        placeholder="Bourbon Amarelo"
        className="lg:col-span-3"
      />
      <TextField
        control={control}
        name={name('altitudeMeters')}
        label="Altitude (m)"
        mask={maskInteger}
        suffix="m"
        inputMode="numeric"
        placeholder="1250"
      />
      <TextField
        control={control}
        name={name('screenSize')}
        label="Peneira"
        mask={maskInteger}
        inputMode="numeric"
        placeholder="17"
        description="De 8 a 20."
      />
      <TextField
        control={control}
        name={name('moisturePercent')}
        label="Umidade (%)"
        mask={maskDecimal2}
        suffix="%"
        inputMode="decimal"
        placeholder="11,5"
      />
      <TextField
        control={control}
        name={name('cuppingScore')}
        label="Pontuação SCA"
        mask={maskDecimal2}
        inputMode="decimal"
        placeholder="86,25"
        description="De 0 a 100."
      />
      <SelectField
        control={control}
        name={name('roastLevel')}
        label="Grau de torra"
        options={toOptions(ROAST_LEVEL_LABELS)}
        noneLabel="Não se aplica"
        placeholder="Não se aplica"
        className="sm:col-span-2"
      />
      <TextareaField
        control={control}
        name={name('notes')}
        label="Observações"
        rows={2}
        placeholder="Notas sensoriais, defeitos, classificação…"
        className="sm:col-span-2 lg:col-span-4"
      />
    </div>
  );
}
