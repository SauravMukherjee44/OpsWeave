from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = Path("output/pdf")


def build_policy(path: Path, *, title: str, owner: str, threshold: str, revision: str, rules: list[str]) -> None:
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="OpsTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=HexColor("#202124"), spaceAfter=8))
    styles.add(ParagraphStyle(name="OpsKicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=HexColor("#4285F4"), tracking=1.5, alignment=TA_CENTER, spaceAfter=16))
    styles.add(ParagraphStyle(name="OpsHeading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=HexColor("#202124"), spaceBefore=14, spaceAfter=7))
    styles.add(ParagraphStyle(name="OpsBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=15, textColor=HexColor("#3C4043"), spaceAfter=7))
    styles.add(ParagraphStyle(name="OpsRule", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=HexColor("#3C4043")))

    doc = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=24 * mm, leftMargin=24 * mm, topMargin=20 * mm, bottomMargin=20 * mm, title=title, author="OpsWeave synthetic logistics workspace")
    story = [
        Paragraph("OPSWEAVE SYNTHETIC LOGISTICS SOURCE", styles["OpsKicker"]),
        Paragraph(title, styles["OpsTitle"]),
        Paragraph("This newly created document contains portfolio-safe synthetic operating policy. It contains no client data or confidential implementation material.", styles["OpsBody"]),
        Spacer(1, 4 * mm),
    ]
    metadata = [["Policy owner", owner], ["Revision", revision], ["Effective", "29 August 2026"], ["Approval threshold", threshold]]
    table = Table(metadata, colWidths=[46 * mm, 105 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#E8F0FE")),
        ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#185ABC")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#DADCE0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([table, Paragraph("Damaged-shipment claim procedure", styles["OpsHeading"])])
    for index, rule in enumerate(rules, 1):
        rule_table = Table([[str(index), Paragraph(rule, styles["OpsRule"])]], colWidths=[10 * mm, 141 * mm], hAlign="LEFT")
        rule_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), HexColor("#F1F3F4")),
            ("TEXTCOLOR", (0, 0), (0, 0), HexColor("#4285F4")),
            ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, HexColor("#E0E4EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(rule_table)
    story.extend([
        Paragraph("Control requirements", styles["OpsHeading"]),
        Paragraph("Every decision must retain the claim identifier, shipment identifier, cited source evidence, rule version, actor, decision timestamp, confidence, and any approval outcome. Failed connector calls must not be treated as successful refunds.", styles["OpsBody"]),
        Paragraph("Escalate when evidence is incomplete, policy sources conflict, package identity cannot be established, fraud indicators are present, or the requested amount exceeds the stated approval threshold.", styles["OpsBody"]),
    ])
    doc.build(story)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    build_policy(
        OUTPUT / "warehouse-damaged-claims-sop.pdf",
        title="Warehouse Damaged Claims SOP",
        owner="Warehouse Operations",
        threshold="Manager approval above USD 250",
        revision="WH-CLAIMS-4.2",
        rules=[
            "Create a claim only when the order, package label, shipment event, and claimant identity can be matched.",
            "Capture at least two package photographs: one showing the shipping label and one showing the damaged area.",
            "For claims up to USD 250, an operations specialist may approve a refund when required evidence is complete and no fraud indicator is present.",
            "Claims above USD 250 require a warehouse manager approval before the refund connector is called.",
            "If evidence is incomplete, request the missing material and place the claim in a waiting state for seven calendar days.",
            "Notify the claimant after approval, rejection, or expiration. A refund must use the original payment method.",
        ],
    )
    build_policy(
        OUTPUT / "finance-refund-control-policy.pdf",
        title="Finance Refund Control Policy",
        owner="Finance Controls",
        threshold="Manager approval at or above USD 200",
        revision="FIN-REFUND-7.1",
        rules=[
            "A damaged-shipment refund must reference the original order and may not exceed the captured payment amount.",
            "Refund requests below USD 200 may be released automatically only after shipment and evidence validation succeed.",
            "Refund requests at or above USD 200 require finance manager approval before any payment operation is attempted.",
            "Duplicate requests with the same claim identifier must return the original operation result and must not issue another refund.",
            "Connector timeout or malformed output requires human review. The workflow may retry a refund operation once using the same idempotency key.",
            "All refund decisions and connector responses must be retained in the append-only audit history.",
        ],
    )


if __name__ == "__main__":
    main()
