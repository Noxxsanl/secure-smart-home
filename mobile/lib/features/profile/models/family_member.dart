class FamilyMember {
  const FamilyMember({
    required this.name,
    required this.roleLabel,
    required this.initials,
    this.isYou = false,
  });

  final String name;
  final String roleLabel;
  final String initials;
  final bool isYou;
}
