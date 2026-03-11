import Badge from '../../../components/ui/Badge';

type BestSupplierBadgeProps = {
  visible?: boolean;
  children?: string;
};

export default function BestSupplierBadge({
  visible = true,
  children = '🏆 Best Price',
}: BestSupplierBadgeProps) {
  if (!visible) {
    return null;
  }

  return (
    <Badge variant="success" size="sm">{children}</Badge>
  );
}
