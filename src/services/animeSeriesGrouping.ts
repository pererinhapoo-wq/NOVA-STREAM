import { VideoItem } from '../types/video';

export interface ParsedEpisodeInfo {
  isSeries: boolean;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number | null;
  isConfirmedNumber: boolean;
  unconfirmedNotice?: string;
}

export interface SeasonGroup {
  seasonNumber: number;
  seasonLabel: string;
  episodes: {
    video: VideoItem;
    parsed: ParsedEpisodeInfo;
  }[];
  confirmedEpisodesCount: number;
  unconfirmedEpisodesCount: number;
}

export interface AnimeGroup {
  id: string;
  title: string;
  normalizedTitle: string;
  posterUrl: string;
  totalSeasons: number;
  totalEpisodes: number;
  seasons: SeasonGroup[];
  sampleVideo?: VideoItem;
}

export interface LibraryGroupedResult {
  animes: AnimeGroup[];
  standalones: VideoItem[];
}

/**
 * Normaliza o título para agrupamento estável (sem acentos, minúsculas, espaços unificados)
 */
export function normalizeSeriesTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Analisa um vídeo para determinar se pertence a um anime/série e sua respectiva temporada e episódio.
 * Segue regras estritas de não presunção: não assume EP 01 a menos que comprovado por metadados reais.
 */
export function parseVideoSeriesMetadata(video: VideoItem): ParsedEpisodeInfo {
  if (!video || !video.title) {
    return { isSeries: false, isConfirmedNumber: false };
  }

  const rawTitle = video.title.trim();

  // 1. Padrão formal da ingestão por lote: "Nome da Obra • T01E01", "Nome • T01E01 - Título do Episódio"
  const standardBatchMatch = rawTitle.match(
    /^(.+?)\s*[•·\-\/]\s*T(\d+)\s*E(\d+)(?:\s*[-:•·/]\s*(.*))?$/i
  );
  if (standardBatchMatch) {
    const series = standardBatchMatch[1].trim();
    const season = parseInt(standardBatchMatch[2], 10);
    const episode = parseInt(standardBatchMatch[3], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return {
        isSeries: true,
        seriesTitle: series,
        seasonNumber: season,
        episodeNumber: episode,
        isConfirmedNumber: true,
      };
    }
  }

  // 2. Padrão ocidental alternativo: "Nome da Obra S01E01", "Nome - S1E1 - Nome"
  const westernMatch = rawTitle.match(
    /^(.+?)\s*[•·\-\/]?\s*S(\d+)\s*E(\d+)(?:\s*[-:•·/]\s*(.*))?$/i
  );
  if (westernMatch) {
    const series = westernMatch[1].trim();
    const season = parseInt(westernMatch[2], 10);
    const episode = parseInt(westernMatch[3], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return {
        isSeries: true,
        seriesTitle: series,
        seasonNumber: season,
        episodeNumber: episode,
        isConfirmedNumber: true,
      };
    }
  }

  // 3. Padrão em português com temporada e episódio: "Nome - Temporada 1 - Episódio 02 - Título"
  const ptDetailedMatch = rawTitle.match(
    /^(.+?)\s*[-•·/]?\s*temporada\s*(\d+)\s*[-•·/]?\s*(?:epis[oó]dio|ep\.?)\s*(\d+)(?:\s*[-:•·/]\s*(.*))?$/i
  );
  if (ptDetailedMatch) {
    const series = ptDetailedMatch[1].trim();
    const season = parseInt(ptDetailedMatch[2], 10);
    const episode = parseInt(ptDetailedMatch[3], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return {
        isSeries: true,
        seriesTitle: series,
        seasonNumber: season,
        episodeNumber: episode,
        isConfirmedNumber: true,
      };
    }
  }

  // 4. Padrão específico para vídeos com menção de temporada sem número explícito de episódio no título:
  // Exemplo real: "Attack on Titan temporada 1"
  const ptSeasonOnlyMatch = rawTitle.match(/^(.+?)\s+temporada\s+(\d+)$/i);
  if (ptSeasonOnlyMatch) {
    const series = ptSeasonOnlyMatch[1].trim();
    const season = parseInt(ptSeasonOnlyMatch[2], 10);

    // Tentar localizar com segurança o número do episódio em tags
    let confirmedEp: number | null = null;
    if (Array.isArray(video.tags)) {
      for (const tag of video.tags) {
        if (!tag || typeof tag !== 'string') continue;
        const tagEpMatch = tag.trim().match(/^(?:ep\.?|epis[oó]dio|e)\s*(\d+)$/i);
        if (tagEpMatch) {
          const num = parseInt(tagEpMatch[1], 10);
          if (!isNaN(num)) {
            confirmedEp = num;
            break;
          }
        }
      }
    }

    // Se as tags ou descrição não tiverem confirmação indiscutível, NÃO presuma EP 01!
    if (confirmedEp !== null) {
      return {
        isSeries: true,
        seriesTitle: series,
        seasonNumber: season,
        episodeNumber: confirmedEp,
        isConfirmedNumber: true,
      };
    }

    return {
      isSeries: true,
      seriesTitle: series,
      seasonNumber: season,
      episodeNumber: null,
      isConfirmedNumber: false,
      unconfirmedNotice: 'Numeração do episódio não confirmada nos metadados originais.',
    };
  }

  // 5. Verificação de tags secundárias (ex: tag 'Série' e tags de temporada 'T1')
  if (Array.isArray(video.tags) && video.tags.includes('Série')) {
    let tagSeason: number | null = null;
    let tagEp: number | null = null;
    let detectedSeriesName: string | null = null;

    for (const tag of video.tags) {
      if (!tag) continue;
      const sMatch = tag.match(/^T(\d+)$/i);
      if (sMatch) tagSeason = parseInt(sMatch[1], 10);

      const eMatch = tag.match(/^E(\d+)$/i);
      if (eMatch) tagEp = parseInt(eMatch[1], 10);

      if (tag !== 'Série' && !sMatch && !eMatch && !detectedSeriesName) {
        detectedSeriesName = tag;
      }
    }

    if (tagSeason !== null) {
      return {
        isSeries: true,
        seriesTitle: detectedSeriesName || rawTitle,
        seasonNumber: tagSeason,
        episodeNumber: tagEp,
        isConfirmedNumber: tagEp !== null,
        unconfirmedNotice:
          tagEp === null ? 'Numeração do episódio não confirmada nas tags.' : undefined,
      };
    }
  }

  // Caso não se enquadre em nenhuma regra de série/anime, é um vídeo avulso
  return {
    isSeries: false,
    isConfirmedNumber: false,
  };
}

/**
 * Agrupa todos os vídeos fornecidos em Animes/Séries e Vídeos Avulsos,
 * preservando integralmente todos os dados, IDs, URLs e títulos.
 */
export function groupVideosByAnimeAndSeason(videos: VideoItem[]): LibraryGroupedResult {
  const animesMap = new Map<string, AnimeGroup>();
  const standalones: VideoItem[] = [];

  for (const video of videos) {
    if (!video) continue;

    const parsed = parseVideoSeriesMetadata(video);

    if (!parsed.isSeries || !parsed.seriesTitle || typeof parsed.seasonNumber !== 'number') {
      standalones.push(video);
      continue;
    }

    const normSeriesKey = normalizeSeriesTitle(parsed.seriesTitle);
    let animeGroup = animesMap.get(normSeriesKey);

    if (!animeGroup) {
      animeGroup = {
        id: `anime-${normSeriesKey.replace(/[^a-z0-9]+/g, '-')}`,
        title: parsed.seriesTitle,
        normalizedTitle: normSeriesKey,
        posterUrl: video.posterUrl || '',
        totalSeasons: 0,
        totalEpisodes: 0,
        seasons: [],
        sampleVideo: video,
      };
      animesMap.set(normSeriesKey, animeGroup);
    }

    // Se o poster atual do grupo for vazio e este vídeo tiver um, aproveita
    if (!animeGroup.posterUrl && video.posterUrl) {
      animeGroup.posterUrl = video.posterUrl;
    }

    // Localizar ou criar a temporada
    let seasonGroup = animeGroup.seasons.find((s) => s.seasonNumber === parsed.seasonNumber);
    if (!seasonGroup) {
      seasonGroup = {
        seasonNumber: parsed.seasonNumber,
        seasonLabel: `Temporada ${parsed.seasonNumber}`,
        episodes: [],
        confirmedEpisodesCount: 0,
        unconfirmedEpisodesCount: 0,
      };
      animeGroup.seasons.push(seasonGroup);
    }

    seasonGroup.episodes.push({ video, parsed });
    if (parsed.isConfirmedNumber) {
      seasonGroup.confirmedEpisodesCount++;
    } else {
      seasonGroup.unconfirmedEpisodesCount++;
    }
  }

  // Ordenar temporadas numericamente e episódios dentro de cada temporada
  const animes: AnimeGroup[] = Array.from(animesMap.values()).map((anime) => {
    anime.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

    let totalEps = 0;
    for (const season of anime.seasons) {
      // Ordenação de episódios:
      // Itens com número confirmado ordenam por episodeNumber asc (1, 2, 3...)
      // Itens sem número confirmado ficam agrupados com transparência
      season.episodes.sort((a, b) => {
        const numA = a.parsed.episodeNumber;
        const numB = b.parsed.episodeNumber;

        if (numA !== null && numA !== undefined && numB !== null && numB !== undefined) {
          return numA - numB;
        }
        if (numA !== null && numA !== undefined) return -1;
        if (numB !== null && numB !== undefined) return 1;

        // Se ambos não tiverem número, ordena por data de criação ou título
        return (a.video.createdAt || '').localeCompare(b.video.createdAt || '');
      });

      totalEps += season.episodes.length;
    }

    anime.totalSeasons = anime.seasons.length;
    anime.totalEpisodes = totalEps;
    return anime;
  });

  // Ordenar animes por título
  animes.sort((a, b) => a.title.localeCompare(b.title));

  return {
    animes,
    standalones,
  };
}

export interface SeasonEpisodeAnalysis {
  seriesTitle: string;
  seasonNumber: number;
  totalVideosInSeason: number;
  confirmedCount: number;
  unconfirmedCount: number;
  confirmedEpisodeNumbers: number[];
  highestConfirmedEpisode: number;
  suggestedNextEpisodeNumber: number;
  hasAmbiguity: boolean;
  unconfirmedVideos: { video: VideoItem; parsed: ParsedEpisodeInfo }[];
  ambiguityNotice?: string;
}

/**
 * Analisa a temporada de uma obra no catálogo para calcular honestamente a próxima numeração
 * disponível e detectar se há ambiguidade decorrente de vídeos com numeração não confirmada.
 */
export function getSeasonEpisodeAnalysis(
  catalog: VideoItem[],
  seriesTitle: string,
  seasonNumber: number
): SeasonEpisodeAnalysis {
  const normTargetSeries = normalizeSeriesTitle(seriesTitle);
  const confirmedEpisodeNumbers: number[] = [];
  const unconfirmedVideos: { video: VideoItem; parsed: ParsedEpisodeInfo }[] = [];

  if (Array.isArray(catalog) && normTargetSeries) {
    for (const v of catalog) {
      if (!v) continue;
      const parsed = parseVideoSeriesMetadata(v);
      if (
        parsed.isSeries &&
        parsed.seriesTitle &&
        normalizeSeriesTitle(parsed.seriesTitle) === normTargetSeries &&
        parsed.seasonNumber === seasonNumber
      ) {
        if (parsed.isConfirmedNumber && typeof parsed.episodeNumber === 'number') {
          confirmedEpisodeNumbers.push(parsed.episodeNumber);
        } else {
          unconfirmedVideos.push({ video: v, parsed });
        }
      }
    }
  }

  confirmedEpisodeNumbers.sort((a, b) => a - b);
  const highestConfirmedEpisode =
    confirmedEpisodeNumbers.length > 0 ? Math.max(...confirmedEpisodeNumbers) : 0;
  const totalVideosInSeason = confirmedEpisodeNumbers.length + unconfirmedVideos.length;

  // Próximo número sugerido:
  // Se houver episódios confirmados, próximo é highestConfirmedEpisode + 1.
  // Se houver vídeos não confirmados (ex: 1 vídeo como "Attack on Titan temporada 1"),
  // o próximo número sugerido é totalVideosInSeason + 1 (ex: 1 vídeo existente -> sugere EP 02).
  // Se a temporada for vazia -> sugere 1.
  let suggestedNextEpisodeNumber = 1;
  if (highestConfirmedEpisode > 0) {
    suggestedNextEpisodeNumber = Math.max(highestConfirmedEpisode + 1, totalVideosInSeason + 1);
  } else if (totalVideosInSeason > 0) {
    suggestedNextEpisodeNumber = totalVideosInSeason + 1;
  }

  const hasAmbiguity = unconfirmedVideos.length > 0;
  let ambiguityNotice: string | undefined = undefined;
  if (hasAmbiguity) {
    const unconfirmedTitles = unconfirmedVideos
      .map((u) => `"${u.video.title}"`)
      .slice(0, 2)
      .join(', ');
    ambiguityNotice = `Atenção: Esta temporada já possui ${unconfirmedVideos.length} ${
      unconfirmedVideos.length === 1 ? 'vídeo cadastrado' : 'vídeos cadastrados'
    } com numeração de episódio não confirmada (${unconfirmedTitles}). A numeração automática sugeriu iniciar a partir do EP ${String(
      suggestedNextEpisodeNumber
    ).padStart(2, '0')}. Você pode confirmar ou alterar o número do episódio livremente.`;
  }

  return {
    seriesTitle,
    seasonNumber,
    totalVideosInSeason,
    confirmedCount: confirmedEpisodeNumbers.length,
    unconfirmedCount: unconfirmedVideos.length,
    confirmedEpisodeNumbers,
    highestConfirmedEpisode,
    suggestedNextEpisodeNumber,
    hasAmbiguity,
    unconfirmedVideos,
    ambiguityNotice,
  };
}
