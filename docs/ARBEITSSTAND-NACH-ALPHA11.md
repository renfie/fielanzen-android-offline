# Entwicklungsstand nach Alpha 11 – NICHT als geprüfte Android-Version freigegeben

Dieser vollständige lokale Projektstand enthält die nach den Alpha-11-Gerätetests vorgenommenen Verbesserungen:
- Kontenverwaltung standardmäßig einklappen.
- Bei einer hängenden Android-SAF-Ordnerauswahl sichtbar abbrechen statt endlos laden.
- Opt-in-Alternative Downloads/FieLanzen mittels Android MediaStore auf Android 10+.
- Veröffentlichungs-Audit und zusätzliche Ausschlussregeln privater Daten.

Die bereits getestete Alpha 11 bleibt auf dem Smartphone installiert. Der neue Android-Java-Code ist hier **nicht nativ kompiliert** worden und weder Ordnerdialog noch MediaStore-Export wurden auf dem S26 geprüft. Vor jeder Installation weiterhin eine externe JSON-Sicherung erstellen. Kein GitHub-Zugriff/Push.
