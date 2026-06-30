"""
AgroRaiz — Database Seed Script
Run: python -m app.scripts.seed
"""
import asyncio
from datetime import datetime
from sqlalchemy import func, select

async def seed():
    from app.core.database import init_db, AsyncSessionLocal
    from app.models.models import (
        Store, User, Product, ConfirmacaoStatus, UserRole
    )
    from app.core.security import hash_password as get_password_hash

    await init_db()

    async with AsyncSessionLocal() as db:
        # Check if already seeded
        existing = await db.scalar(select(func.count(Store.id)))
        if existing and existing > 0:
            print("✓ Already seeded")
            # Still seed products if they're missing
            store = (await db.execute(select(Store).limit(1))).scalar_one_or_none()
            if store:
                prod_count = await db.scalar(select(func.count(Product.id)).where(Product.store_id == store.id))
                if prod_count and prod_count < 10:
                    await _seed_products(db, store.id)
                    await db.commit()
                else:
                    print(f"✓ Products already seeded ({prod_count} found)")
            return

        # Create store
        store = Store(
            name="Agro Raiz",
            slug="agro-raiz",
            whatsapp="+5531995122303",
            instagram="@_agroraiz_",
            city="Ouro Branco",
            state="MG",
            active=True,
            ai_config={
                "persona_name": "Ana",
                "persona_prompt": "Você é Ana, atendente da Agro Raiz.",
            },
        )
        db.add(store)
        await db.flush()
        print(f"✓ Store created: {store.id}")

        # Create admin user
        admin = User(
            store_id=store.id,
            name="Admin Agro Raiz",
            email="admin@agroraiz.com.br",
            hashed_password=get_password_hash("AgroRaiz@2024"),
            role=UserRole.OWNER,
            active=True,
        )
        db.add(admin)
        print("✓ Admin created: admin@agroraiz.com.br / AgroRaiz@2024")
        print("⚠️  Change the password after first login!")

        # Seed 50 products
        await _seed_products(db, store.id)
        await db.commit()


async def _seed_products(db, store_id):
    from app.models.models import Product, ConfirmacaoStatus

    products_data = [
        # RAÇÕES PET
        {"nome":"Ração Golden Adulto 15kg","categoria":"racoes_pet","marca":"Golden","preco":139.90,"estoque":25,"estoque_minimo":5,"unidade":"un","descricao":"Ração super premium para cães adultos"},
        {"nome":"Ração Golden Filhote 15kg","categoria":"racoes_pet","marca":"Golden","preco":149.90,"estoque":18,"estoque_minimo":5,"unidade":"un","descricao":"Ração super premium para filhotes"},
        {"nome":"Ração Premier Adulto 15kg","categoria":"racoes_pet","marca":"Premier","preco":165.00,"estoque":12,"estoque_minimo":4,"unidade":"un","descricao":"Nutrição completa para cães adultos"},
        {"nome":"Ração Premier Filhote 2.5kg","categoria":"racoes_pet","marca":"Premier","preco":72.50,"estoque":20,"estoque_minimo":5,"unidade":"un","descricao":"Ração premium para filhotes"},
        {"nome":"Ração Special Dog Adulto 20kg","categoria":"racoes_pet","marca":"Special Dog","preco":95.00,"estoque":30,"estoque_minimo":8,"unidade":"un","descricao":"Ração econômica de qualidade"},
        {"nome":"Ração Whiskas Frango 1kg","categoria":"racoes_pet","marca":"Whiskas","preco":18.90,"estoque":40,"estoque_minimo":10,"unidade":"un","descricao":"Ração para gatos adultos"},
        {"nome":"Ração Royal Canin Gato 1.5kg","categoria":"racoes_pet","marca":"Royal Canin","preco":89.90,"estoque":15,"estoque_minimo":4,"unidade":"un","descricao":"Nutrição especializada felinos"},
        {"nome":"Ração Pedigree Adulto 10.1kg","categoria":"racoes_pet","marca":"Pedigree","preco":89.90,"estoque":22,"estoque_minimo":6,"unidade":"un","descricao":"Ração completa cães adultos"},
        {"nome":"Ração Hills Science Diet 12kg","categoria":"racoes_pet","marca":"Hills","preco":285.00,"estoque":8,"estoque_minimo":3,"unidade":"un","descricao":"Nutrição veterinária premium"},
        {"nome":"Ração N&D Grain Free 2.5kg","categoria":"racoes_pet","marca":"N&D","preco":98.00,"estoque":14,"estoque_minimo":4,"unidade":"un","descricao":"Ração grain free para cães"},
        # RAÇÕES AGRO
        {"nome":"Ração Guabi Agro Bovinos 30kg","categoria":"racoes_agro","marca":"Guabi","preco":185.00,"estoque":35,"estoque_minimo":10,"unidade":"sc","descricao":"Suplemento mineral para bovinos"},
        {"nome":"Ração Presence Aves 25kg","categoria":"racoes_agro","marca":"Presence","preco":89.00,"estoque":28,"estoque_minimo":8,"unidade":"sc","descricao":"Ração completa para aves"},
        {"nome":"Sal Mineral Bovinos 30kg","categoria":"racoes_agro","marca":"Tortuga","preco":95.00,"estoque":40,"estoque_minimo":12,"unidade":"sc","descricao":"Sal mineral completo para bovinos"},
        {"nome":"Ração Suíno Crescimento 25kg","categoria":"racoes_agro","marca":"Nutri","preco":78.00,"estoque":20,"estoque_minimo":6,"unidade":"sc","descricao":"Ração para suínos fase crescimento"},
        {"nome":"Concentrado Proteico Bovino 30kg","categoria":"racoes_agro","marca":"Vaccinar","preco":142.00,"estoque":15,"estoque_minimo":5,"unidade":"sc","descricao":"Concentrado proteico para bovinos"},
        # MEDICAMENTOS PET
        {"nome":"Vermífugo Drontal Cães","categoria":"medicamentos_pet","marca":"Bayer","preco":34.90,"estoque":45,"estoque_minimo":10,"unidade":"comp","descricao":"Vermífugo de amplo espectro"},
        {"nome":"Bravecto Antipulgas 10-20kg","categoria":"medicamentos_pet","marca":"MSD","preco":149.00,"estoque":20,"estoque_minimo":5,"unidade":"un","descricao":"Proteção 3 meses pulgas e carrapatos"},
        {"nome":"Frontline Plus Cão M","categoria":"medicamentos_pet","marca":"Merial","preco":68.00,"estoque":30,"estoque_minimo":8,"unidade":"pip","descricao":"Antipulgas e carrapatos pipeta"},
        {"nome":"Simparic Antipulgas 20-40kg","categoria":"medicamentos_pet","marca":"Zoetis","preco":89.00,"estoque":18,"estoque_minimo":5,"unidade":"comp","descricao":"Comprimido antipulgas mensal"},
        {"nome":"Doxiciclina 100mg 16 comp","categoria":"medicamentos_pet","marca":"Ourofino","preco":42.00,"estoque":25,"estoque_minimo":6,"unidade":"cx","descricao":"Antibiótico veterinário"},
        # MEDICAMENTOS AGRO
        {"nome":"Ivermectina Bovinos 500ml","categoria":"medicamentos_agro","marca":"Merial","preco":65.00,"estoque":30,"estoque_minimo":8,"unidade":"fr","descricao":"Endectocida injetável bovinos"},
        {"nome":"Dectomax Antiparasitário 500ml","categoria":"medicamentos_agro","marca":"Zoetis","preco":185.00,"estoque":15,"estoque_minimo":4,"unidade":"fr","descricao":"Doramectina injetável"},
        {"nome":"Vacina Aftosa 50 doses","categoria":"medicamentos_agro","marca":"Intervet","preco":89.00,"estoque":25,"estoque_minimo":6,"unidade":"fr","descricao":"Vacina contra febre aftosa"},
        {"nome":"Enrofloxacina 10% 100ml","categoria":"medicamentos_agro","marca":"Ourofino","preco":48.00,"estoque":20,"estoque_minimo":5,"unidade":"fr","descricao":"Antibiótico de amplo espectro"},
        {"nome":"Closamectina Bov 1L","categoria":"medicamentos_agro","marca":"Ceva","preco":145.00,"estoque":12,"estoque_minimo":4,"unidade":"fr","descricao":"Antiparasitário interno e externo"},
        # FERTILIZANTES
        {"nome":"NPK 10-10-10 25kg","categoria":"fertilizantes","marca":"Produquímica","preco":89.00,"estoque":50,"estoque_minimo":15,"unidade":"sc","descricao":"Fertilizante granulado polivalente"},
        {"nome":"Ureia 45% Nitrogenio 25kg","categoria":"fertilizantes","marca":"Heringer","preco":75.00,"estoque":40,"estoque_minimo":12,"unidade":"sc","descricao":"Fonte de nitrogênio para lavoura"},
        {"nome":"Sulfato de Amônio 25kg","categoria":"fertilizantes","marca":"Yara","preco":68.00,"estoque":35,"estoque_minimo":10,"unidade":"sc","descricao":"Fertilizante nitrogenado"},
        {"nome":"Cloreto de Potassio 25kg","categoria":"fertilizantes","marca":"ICL","preco":82.00,"estoque":30,"estoque_minimo":8,"unidade":"sc","descricao":"Fonte de potássio para plantas"},
        {"nome":"Superfosfato Simples 25kg","categoria":"fertilizantes","marca":"Copebrás","preco":55.00,"estoque":38,"estoque_minimo":10,"unidade":"sc","descricao":"Fertilizante fosfatado"},
        {"nome":"Adubo Orgânico Bokashi 5kg","categoria":"fertilizantes","marca":"Organoaves","preco":32.00,"estoque":60,"estoque_minimo":15,"unidade":"sc","descricao":"Adubo orgânico fermentado"},
        # SEMENTES
        {"nome":"Semente Milho Híbrido 5kg","categoria":"sementes","marca":"Seminis","preco":125.00,"estoque":20,"estoque_minimo":5,"unidade":"sc","descricao":"Semente milho alto desempenho"},
        {"nome":"Semente Soja Nitragin 50kg","categoria":"sementes","marca":"Dow","preco":320.00,"estoque":15,"estoque_minimo":4,"unidade":"sc","descricao":"Semente soja tratada"},
        {"nome":"Semente Brachiaria 1kg","categoria":"sementes","marca":"Matsuda","preco":28.00,"estoque":80,"estoque_minimo":20,"unidade":"kg","descricao":"Semente braquiária para pastagem"},
        {"nome":"Semente Amendoim Cavalo 1kg","categoria":"sementes","marca":"IAC","preco":22.00,"estoque":45,"estoque_minimo":12,"unidade":"kg","descricao":"Amendoim forrageiro"},
        {"nome":"Semente Capim Mombaça 1kg","categoria":"sementes","marca":"Matsuda","preco":35.00,"estoque":55,"estoque_minimo":15,"unidade":"kg","descricao":"Panicum maximum cv Mombaça"},
        # FERRAMENTAS
        {"nome":"Pulverizador Costal 20L","categoria":"ferramentas","marca":"Jacto","preco":185.00,"estoque":12,"estoque_minimo":3,"unidade":"un","descricao":"Pulverizador manual para defensivos"},
        {"nome":"Bomba Aplicação 5L","categoria":"ferramentas","marca":"Guarany","preco":89.00,"estoque":15,"estoque_minimo":4,"unidade":"un","descricao":"Pulverizador bomba 5 litros"},
        {"nome":"Enxada Cabo Longo","categoria":"ferramentas","marca":"Tramontina","preco":45.00,"estoque":25,"estoque_minimo":6,"unidade":"un","descricao":"Enxada para cultivo"},
        {"nome":"Facão Aço Inox 45cm","categoria":"ferramentas","marca":"Tramontina","preco":89.00,"estoque":18,"estoque_minimo":5,"unidade":"un","descricao":"Facão para limpeza de pasto"},
        {"nome":"Tesoura de Poda 25mm","categoria":"ferramentas","marca":"Vonder","preco":125.00,"estoque":10,"estoque_minimo":3,"unidade":"un","descricao":"Tesoura poda ramos até 25mm"},
        # PRODUTOS PET
        {"nome":"Areia Sanitária Gato 4kg","categoria":"produtos_pet","marca":"Pipicat","preco":28.90,"estoque":50,"estoque_minimo":15,"unidade":"un","descricao":"Areia sanitária granulada fina"},
        {"nome":"Shampoo Cão Neutro 500ml","categoria":"produtos_pet","marca":"Pet Society","preco":24.90,"estoque":35,"estoque_minimo":10,"unidade":"fr","descricao":"Shampoo neutro para cães"},
        {"nome":"Coleira Antipulga Cão G","categoria":"produtos_pet","marca":"Seresto","preco":89.00,"estoque":20,"estoque_minimo":5,"unidade":"un","descricao":"Coleira antipulga 8 meses proteção"},
        {"nome":"Comedouro Inox Médio","categoria":"produtos_pet","marca":"Furacão Pet","preco":35.00,"estoque":30,"estoque_minimo":8,"unidade":"un","descricao":"Comedouro em aço inox 600ml"},
        {"nome":"Casinha Plástica Cão M","categoria":"produtos_pet","marca":"Chalezinho","preco":185.00,"estoque":8,"estoque_minimo":2,"unidade":"un","descricao":"Casinha plástica para cão médio"},
        {"nome":"Peitoral Regulável Cão P","categoria":"produtos_pet","marca":"Zee Dog","preco":89.00,"estoque":22,"estoque_minimo":6,"unidade":"un","descricao":"Peitoral regulável neoprene"},
        {"nome":"Tapete Higiênico 30un","categoria":"produtos_pet","marca":"Petix","preco":42.00,"estoque":45,"estoque_minimo":12,"unidade":"pct","descricao":"Tapete absorvente para cães"},
        {"nome":"Ração Úmida Gato 85g","categoria":"racoes_pet","marca":"Whiskas","preco":4.90,"estoque":100,"estoque_minimo":30,"unidade":"un","descricao":"Alimento úmido sabor atum"},
        {"nome":"Petisco Ossinho 400g","categoria":"produtos_pet","marca":"Bifinho","preco":18.90,"estoque":60,"estoque_minimo":15,"unidade":"pct","descricao":"Petisco crocante para cães"},
        {"nome":"Desinfetante Rural 5L","categoria":"higiene_agro","marca":"Coveli","preco":38.00,"estoque":20,"estoque_minimo":6,"unidade":"fr","descricao":"Desinfetante para instalações rurais"},
    ]

    count = 0
    for i, p in enumerate(products_data):
        prod = Product(
            store_id=store_id,
            nome=p["nome"],
            categoria=p["categoria"],
            marca=p.get("marca"),
            preco=p["preco"],
            estoque=p["estoque"],
            estoque_minimo=p["estoque_minimo"],
            unidade=p["unidade"],
            descricao=p.get("descricao", ""),
            ativo=True,
            destaque=(i < 6),
            status_confirmacao=ConfirmacaoStatus.CONFIRMADO,
            data_ultima_confirmacao=datetime.utcnow(),
            confirmado_por="seed",
        )
        db.add(prod)
        count += 1
    print(f"✓ {count} produtos criados")


if __name__ == "__main__":
    asyncio.run(seed())
