import { Palette, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Label } from './ui/label';
import { motion } from 'motion/react';

interface ThemeCustomizerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
}

const colorThemes = [
  { id: 'blue', name: 'Professional Blue', primary: '#2563eb', secondary: '#3b82f6' },
  { id: 'purple', name: 'Modern Purple', primary: '#9333ea', secondary: '#a855f7' },
  { id: 'emerald', name: 'Fresh Emerald', primary: '#059669', secondary: '#10b981' },
  { id: 'rose', name: 'Creative Rose', primary: '#e11d48', secondary: '#f43f5e' },
  { id: 'amber', name: 'Warm Amber', primary: '#d97706', secondary: '#f59e0b' },
  { id: 'slate', name: 'Classic Slate', primary: '#475569', secondary: '#64748b' },
  { id: 'cyan', name: 'Tech Cyan', primary: '#0891b2', secondary: '#06b6d4' },
  { id: 'indigo', name: 'Deep Indigo', primary: '#4f46e5', secondary: '#6366f1' },
];

export function ThemeCustomizer({ selectedColor, onColorChange }: ThemeCustomizerProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-blue-600" />
          <CardTitle>Color Theme</CardTitle>
        </div>
        <CardDescription>
          Customize your resume colors to match your personal brand
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {colorThemes.map((theme, index) => (
              <motion.button
                key={theme.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onColorChange(theme.id)}
                className={`relative p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                  selectedColor === theme.id
                    ? 'border-blue-600 shadow-lg'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div
                      className="w-6 h-6 rounded-full shadow-inner"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <div
                      className="w-6 h-6 rounded-full shadow-inner"
                      style={{ backgroundColor: theme.secondary }}
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{theme.name}</p>
                  </div>
                  {selectedColor === theme.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-2 right-2 bg-blue-600 rounded-full p-1"
                    >
                      <Check className="h-3 w-3 text-white" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-4 text-sm">
            <p className="text-blue-900">
              <strong>Pro Tip:</strong> Choose colors that align with your industry. Creative fields can be bold, while corporate roles should stay professional.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { colorThemes };