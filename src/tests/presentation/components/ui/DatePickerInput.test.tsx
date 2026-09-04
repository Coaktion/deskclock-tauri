import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DatePickerInput } from "@presentation/components/ui/DatePickerInput";
import { todayISO } from "@shared/utils/time";

function campo(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("DatePickerInput", () => {
  it("mostra o valor em DD/MM/AAAA e o vazio como vazio", () => {
    const { rerender } = render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);
    expect(campo().value).toBe("05/09/2026");

    rerender(<DatePickerInput value="" onChange={() => {}} />);
    expect(campo().value).toBe("");
  });

  it("abre o painel no clique e no ↓, sem submeter o formulário em volta", () => {
    render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Setembro" })).toBeNull();

    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Setembro" })).toBeTruthy();
  });

  it("digitar sobe o valor só quando os oito dígitos formam uma data", () => {
    // Enquanto não formam, o que existe é rascunho: o valor de fora fica onde
    // estava, e o campo não corrige o que se está escrevendo.
    const onChange = vi.fn();
    render(<DatePickerInput value="" onChange={onChange} />);

    fireEvent.change(campo(), { target: { value: "0509" } });
    expect(campo().value).toBe("05/09");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(campo(), { target: { value: "05092026" } });
    expect(campo().value).toBe("05/09/2026");
    expect(onChange).toHaveBeenCalledWith("2026-09-05");
  });

  it("recusa data que não existe em vez de corrigi-la sozinha", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="" onChange={onChange} />);
    fireEvent.change(campo(), { target: { value: "31022026" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("não aceita, digitada, a data que o `maxDate` proíbe", () => {
    const onChange = vi.fn();
    render(
      <DatePickerInput value="" onChange={onChange} maxDate={new Date(2026, 8, 10)} />
    );
    fireEvent.change(campo(), { target: { value: "20092026" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(campo(), { target: { value: "05092026" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-05");
  });

  it("o rascunho abandonado volta para o valor ao sair do campo", () => {
    render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);
    fireEvent.change(campo(), { target: { value: "12" } });
    expect(campo().value).toBe("12");

    fireEvent.blur(campo());
    expect(campo().value).toBe("05/09/2026");
  });

  it("escolher no calendário emite o ISO e fecha o painel", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="2026-09-05" onChange={onChange} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("button", { name: "20 de setembro de 2026" }));

    expect(onChange).toHaveBeenCalledWith("2026-09-20");
    expect(screen.queryByRole("button", { name: "Setembro" })).toBeNull();
  });

  it("o rodapé tem Hoje sempre, e Limpar só quando o call site aceita vazio", () => {
    // Vazio não é estado válido em todo lugar — o Lançamento Manual navega o dia
    // por este valor, e limpar ali deixaria a tela sem data para mostrar.
    const { rerender } = render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);
    fireEvent.click(campo());
    expect(screen.getByRole("button", { name: "Hoje" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpar" })).toBeNull();

    rerender(<DatePickerInput value="2026-09-05" onChange={() => {}} clearable />);
    expect(screen.getByRole("button", { name: "Limpar" })).toBeTruthy();
  });

  it("Hoje escolhe o dia de hoje", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="2026-09-05" onChange={onChange} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(onChange).toHaveBeenCalledWith(todayISO());
  });

  it("Limpar emite vazio", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="2026-09-05" onChange={onChange} clearable />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("apagar o campo não emite vazio onde vazio não é válido", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="2026-09-05" onChange={onChange} />);
    fireEvent.change(campo(), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("apagar o campo emite vazio onde ele é válido — é a outra forma de limpar", () => {
    const onChange = vi.fn();
    render(<DatePickerInput value="2026-09-05" onChange={onChange} clearable />);
    fireEvent.change(campo(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("com o painel aberto o Enter é daqui, e fechado ele sobe", () => {
    // É o contrato 3 do §7: quem consome a tecla avisa com `preventDefault`, e o
    // container ignora o que já foi consumido — senão o mesmo Enter que fecha o
    // calendário submete o formulário junto.
    render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);

    const fechado = fireEvent.keyDown(campo(), { key: "Enter" });
    expect(fechado).toBe(true); // ninguém consumiu: sobe para o useSubmitOnEnter

    fireEvent.click(campo());
    const aberto = fireEvent.keyDown(campo(), { key: "Enter" });
    expect(aberto).toBe(false); // consumido aqui
    expect(screen.queryByRole("button", { name: "Setembro" })).toBeNull();
  });

  it("o ESC fecha só o painel, e é consumido para não fechar o modal em volta", () => {
    render(<DatePickerInput value="2026-09-05" onChange={() => {}} />);
    fireEvent.click(campo());

    const consumido = fireEvent.keyDown(campo(), { key: "Escape" });
    expect(consumido).toBe(false);
    expect(screen.queryByRole("button", { name: "Setembro" })).toBeNull();
  });

  it("com rótulo, o campo abre mão da casca própria para o Field em volta", () => {
    const { container } = render(
      <DatePickerInput value="2026-09-05" onChange={() => {}} label="Data" />
    );
    expect(screen.getByText("Data")).toBeTruthy();
    expect(campo().className).toContain("bg-transparent");
    expect(container.querySelector(".border-border")).toBeTruthy();
  });

  it("sem rótulo, a marca de erro entra na casca do próprio campo", () => {
    render(<DatePickerInput value="" onChange={() => {}} invalid />);
    expect(campo().className).toContain("border-danger");
  });
});
